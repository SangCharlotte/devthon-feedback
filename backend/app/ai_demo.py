"""Demo mode: stand-in AI built from keyword rules, for trying the app without an API key.

Turned on with AI_DEMO_MODE=true while AI_API_KEY is empty. It returns the same
shapes as the real AI, so every screen works, but the "intelligence" is a word
list - the dashboard labels it as demo output. Never use it for real decisions.
"""

import re
from collections import Counter

from app.ai import CommentTags, FeedbackSummary, ReplyDraft, Sentiment, Theme, Topic

_TOPIC_WORDS: dict[Topic, tuple[str, ...]] = {
    Topic.COVERAGE: ("coverage", "cover", "coat", "thin"),
    Topic.FINISH: ("finish", "smooth", "gloss", "matt", "streak"),
    Topic.COLOUR: ("colour", "color", "shade", "fade", "faded"),
    Topic.DURABILITY: ("peel", "crack", "flake", "rain", "wash", "last"),
    Topic.DRYING: ("dry", "drying", "sticky", "tacky"),
    Topic.SMELL: ("smell", "odour", "fumes"),
    Topic.PRICE: ("price", "expensive", "cheap", "cost"),
    Topic.DELIVERY: ("deliver", "delivery", "late", "arrived"),
    Topic.AVAILABILITY: ("stock", "available", "out of"),
    Topic.STAFF: ("staff", "rude", "helpful", "calls", "answered", "service"),
    Topic.ADVICE: ("advice", "advised", "recommend"),
    Topic.PACKAGING: ("tin", "lid", "leak", "packaging"),
}
_GOOD = ("great", "good", "love", "excellent", "fast", "nice", "helpful", "smooth", "happy")
_BAD = (
    "peel",
    "crack",
    "fade",
    "bad",
    "poor",
    "late",
    "rude",
    "never",
    "nobody",
    "worst",
    "expensive",
    "leak",
    "smell",
    "thin",
    "sticky",
)

_ACTIONS: dict[Topic, str] = {
    Topic.DURABILITY: "Check recent batches for adhesion problems and contact affected customers.",
    Topic.COLOUR: "Review colour-fastness on the shades customers mention.",
    Topic.DELIVERY: "Look at delivery times with the logistics partner.",
    Topic.STAFF: "Make sure every care-line call is returned within a day.",
    Topic.PRICE: "Compare pricing with the competitors customers mention.",
    Topic.COVERAGE: "Check that coverage claims on the tin match real use.",
}


def _mentions(text: str, words: tuple[str, ...]) -> bool:
    """Words must START with a keyword: "peeled" matches "peel", but "within" isn't "thin"."""
    return any(re.search(rf"\b{re.escape(word)}", text) for word in words)


def tag(comment: str) -> CommentTags:
    text = comment.lower()
    topics = [topic for topic, words in _TOPIC_WORDS.items() if _mentions(text, words)]
    good = _mentions(text, _GOOD)
    bad = _mentions(text, _BAD)
    if good and bad:
        sentiment = Sentiment.MIXED
    elif bad:
        sentiment = Sentiment.NEGATIVE
    elif good:
        sentiment = Sentiment.POSITIVE
    else:
        sentiment = Sentiment.NEUTRAL
    return CommentTags(sentiment=sentiment, topics=topics[:3] or [Topic.OTHER])


def summarize(stats: str, comments: list[tuple[float, str]]) -> FeedbackSummary:
    tagged = [(score, tag(text)) for score, text in comments]
    topic_counts = Counter(topic for _, tags in tagged for topic in tags.topics)
    mood = Counter(tags.sentiment for _, tags in tagged)

    themes = []
    for topic, count in topic_counts.most_common(3):
        scores = [score for score, tags in tagged if topic in tags.topics]
        average = sum(scores) / len(scores)
        sentiment = Sentiment.NEGATIVE if average < 3 else Sentiment.POSITIVE
        themes.append(
            Theme(
                title=topic.value.capitalize(),
                detail=f"In {count} of {len(comments)} comments, average score {average:.1f}.",
                sentiment=sentiment,
            )
        )

    worries = [t for t in topic_counts if t in _ACTIONS and mood[Sentiment.NEGATIVE]]
    top_mood, _ = mood.most_common(1)[0]
    return FeedbackSummary(
        headline=(
            f"[Demo] {len(comments)} comments, mostly {top_mood.value}. "
            f"Most talked about: {themes[0].title.lower() if themes else 'nothing specific'}."
        ),
        themes=themes,
        actions=[_ACTIONS[t] for t in worries[:3]] or ["Keep doing what's working."],
    )


def draft_reply(first_name: str, scores: dict[str, int], comment: str | None) -> ReplyDraft:
    lowest = min(scores, key=scores.get)
    about = f' You told us: "{comment}"' if comment else ""
    return ReplyDraft(
        subject="We're sorry - we'd like to put this right",
        body=(
            f"Dear {first_name},\n\n"
            f"Thank you for your honest feedback, and we're sorry about your experience, "
            f"especially with our {lowest}.{about}\n\n"
            "We'd like to understand exactly what happened. Could we call you at a time "
            "that suits you, or arrange a visit to look at the problem?\n\n"
            "Kind regards,\nCompany X Customer Care\n\n"
            "[Demo draft - written by keyword rules, not AI]"
        ),
    )
