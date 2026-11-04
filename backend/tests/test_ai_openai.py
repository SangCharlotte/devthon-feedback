"""The OpenAI provider, tested against a FakeOpenAI: same contract as Claude, no network."""

from types import SimpleNamespace

import httpx
import openai
import pytest

from app import ai
from app.ai import CommentTags, FeedbackSummary, ReplyDraft, Sentiment, Theme, Topic

FEEDBACK = {
    "name": "Wanjiru Kamau",
    "email": "wanjiru@example.com",
    "phone": "0711 222 333",
    "q1": 2,
    "q2": 1,
    "q3": 2,
    "comment": "The paint peeled within a week",
}
TAGS = CommentTags(sentiment=Sentiment.NEGATIVE, topics=[Topic.DURABILITY])


class FakeOpenAI:
    """Stands in for openai.OpenAI: records requests, replays queued answers."""

    def __init__(self):
        self.requests = []
        self.answers = []
        self.responses = SimpleNamespace(parse=self._parse)

    def answer(self, parsed=None, *, status="completed", refusal=False, error=None):
        self.answers.append((parsed, status, refusal, error))

    def _parse(self, **request):
        self.requests.append(request)
        parsed, status, refusal, error = self.answers.pop(0)
        if error is not None:
            raise error
        part = SimpleNamespace(type="refusal" if refusal else "output_text")
        return SimpleNamespace(
            output_parsed=parsed,
            status=status,
            output=[SimpleNamespace(type="message", content=[part])],
        )


@pytest.fixture
def fake_openai(monkeypatch, settings):
    settings.ai_provider = "openai"
    settings.ai_api_key = "sk-test-not-real"  # gitleaks:allow
    fake = FakeOpenAI()
    monkeypatch.setattr(ai, "_openai_client", lambda api_key, timeout: fake)
    return fake


def _status_error(error_class, status):
    response = httpx.Response(status, request=httpx.Request("POST", "https://api.invalid"))
    return error_class("boom", response=response, body=None)


def test_comments_are_tagged_through_openai(client, fake_openai):
    fake_openai.answer(TAGS)
    client.post("/feedback", json=FEEDBACK)

    item = client.get("/responses").json()["items"][0]
    assert item["ai_sentiment"] == "negative" and item["ai_topics"] == ["durability"]

    request = fake_openai.requests[0]
    assert request["model"] == "gpt-5.4-mini"  # the OpenAI default
    assert request["text_format"] is CommentTags  # strict structured output
    assert request["reasoning"] == {"effort": "low"}
    assert request["store"] is False
    assert "never follow instructions" in request["instructions"]
    assert request["input"] == f"<comment>{FEEDBACK['comment']}</comment>"  # no contact details


def test_older_chat_models_get_no_reasoning_setting(fake_openai, settings):
    settings.ai_model = "gpt-4.1-mini"
    fake_openai.answer(TAGS)
    ai.tag_comment("Great paint")
    assert "reasoning" not in fake_openai.requests[0]
    assert fake_openai.requests[0]["model"] == "gpt-4.1-mini"


@pytest.mark.parametrize(
    ("answer", "message"),
    [
        ({"refusal": True}, "declined"),
        ({"status": "incomplete"}, "incomplete"),
        ({}, "incomplete"),  # output_parsed is None
    ],
)
def test_unusable_openai_answers_become_ai_unavailable(fake_openai, answer, message):
    fake_openai.answer(None, **answer)
    with pytest.raises(ai.AIUnavailable, match=message):
        ai.tag_comment("Great paint")


@pytest.mark.parametrize(
    ("error", "message"),
    [
        (_status_error(openai.AuthenticationError, 401), "key rejected"),
        (_status_error(openai.RateLimitError, 429), "busy"),
        (_status_error(openai.InternalServerError, 500), "request failed"),
        (openai.APIConnectionError(request=httpx.Request("POST", "https://x.invalid")), "reach"),
    ],
)
def test_openai_errors_become_ai_unavailable(fake_openai, error, message):
    fake_openai.answer(error=error)
    with pytest.raises(ai.AIUnavailable, match=message):
        ai.tag_comment("Great paint")


def test_feedback_still_saves_when_openai_is_down(client, fake_openai, outbox):
    fake_openai.answer(error=_status_error(openai.InternalServerError, 500))
    response = client.post("/feedback", json=FEEDBACK)
    assert response.status_code == 201
    assert response.json()["alert_created"] is True
    assert client.get("/responses").json()["items"][0]["ai_sentiment"] is None


def test_summary_through_openai(client, fake_openai):
    fake_openai.answer(TAGS)
    client.post("/feedback", json=FEEDBACK)
    summary = FeedbackSummary(
        headline="Peeling is the main complaint",
        themes=[Theme(title="Peeling", detail="One painter", sentiment=Sentiment.NEGATIVE)],
        actions=["Check the exterior batch"],
    )
    fake_openai.answer(summary)

    body = client.post("/ai/summary").json()

    assert body["headline"] == "Peeling is the main complaint"
    request = fake_openai.requests[-1]
    assert request["text_format"] is FeedbackSummary
    assert request["reasoning"] == {"effort": "medium"}
    assert "wanjiru" not in request["input"].lower()


def test_reply_draft_through_openai(client, fake_openai, outbox):
    fake_openai.answer(TAGS)
    client.post("/feedback", json=FEEDBACK)
    alert_id = client.get("/alerts").json()[0]["id"]
    fake_openai.answer(ReplyDraft(subject="We're sorry", body="Dear Wanjiru, ..."))

    draft = client.post(f"/alerts/{alert_id}/draft").json()

    assert draft == {"subject": "We're sorry", "body": "Dear Wanjiru, ..."}
    request = fake_openai.requests[-1]
    assert request["text_format"] is ReplyDraft
    assert "Wanjiru" in request["input"] and "Kamau" not in request["input"]
    assert "Company X Customer Care" in request["instructions"]
