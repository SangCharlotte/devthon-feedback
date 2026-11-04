import { PaintCan } from "@/components/brand/Brand";

import styles from "./HouseIllustration.module.css";

/** A freshly painted modern two-storey house with trees and a Company X tin. Decorative. */
export function HouseIllustration({ className }: { className?: string }) {
  return (
    <svg
      className={`${styles.art} ${className ?? ""}`}
      viewBox="12 24 296 216"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {/* Sky blob, sun and clouds */}
      <path
        className={styles.blob}
        d="M40 150C30 92 74 40 140 30c70-10 132 20 146 80 14 58-20 104-84 116-70 14-150-14-162-76z"
      />
      <circle className={styles.sun} cx="250" cy="62" r="16" />
      <g className={styles.cloud}>
        <ellipse cx="78" cy="70" rx="22" ry="9" />
        <ellipse cx="92" cy="64" rx="14" ry="10" />
      </g>

      {/* Lawn */}
      <ellipse className={styles.lawn} cx="160" cy="214" rx="150" ry="20" />

      {/* Round tree, left */}
      <rect className={styles.trunk} x="40" y="150" width="6" height="58" rx="3" />
      <circle className={styles.treeDark} cx="43" cy="140" r="26" />
      <circle className={styles.treeLight} cx="36" cy="132" r="18" />

      {/* Cypress, right */}
      <rect className={styles.trunk} x="280" y="170" width="5" height="40" rx="2.5" />
      <path className={styles.treeDark} d="M282 92c14 24 18 50 14 74-3 10-25 10-28 0-4-24 0-50 14-74z" />
      <path className={styles.treeLight} d="M282 104c7 18 9 38 6 56-2 6-10 6-12 0-3-18 0-38 6-56z" />

      {/* Ground floor */}
      <rect className={styles.wall} x="74" y="128" width="190" height="80" rx="3" />
      <rect className={styles.wood} x="74" y="128" width="54" height="80" />
      <path className={styles.woodLine} d="M84 128v80M95 128v80M106 128v80M117 128v80" />
      {/* Upper floor, set back */}
      <rect className={styles.wallAlt} x="112" y="66" width="128" height="62" rx="3" />
      {/* Flat roof slabs */}
      <rect className={styles.trim} x="104" y="58" width="144" height="10" rx="3" />
      <rect className={styles.trim} x="66" y="122" width="206" height="9" rx="3" />

      {/* Windows */}
      <rect className={styles.window} x="128" y="80" width="40" height="34" rx="2" />
      <rect className={styles.window} x="180" y="80" width="46" height="34" rx="2" />
      <path className={styles.mullion} d="M148 80v34M203 80v34" />
      <rect className={styles.window} x="186" y="144" width="62" height="40" rx="2" />
      <path className={styles.mullion} d="M206 144v40M227 144v40" />
      <rect className={styles.window} x="84" y="144" width="32" height="26" rx="2" />

      {/* Front door with a little step */}
      <rect className={styles.door} x="140" y="150" width="30" height="58" rx="2" />
      <circle className={styles.knob} cx="164" cy="180" r="2" />
      <rect className={styles.trim} x="134" y="206" width="42" height="5" rx="2" />

      {/* Bushes */}
      <circle className={styles.treeLight} cx="82" cy="206" r="10" />
      <circle className={styles.treeDark} cx="96" cy="209" r="8" />
      <circle className={styles.treeLight} cx="254" cy="206" r="10" />

      {/* Company X tin in front of the house */}
      <g transform="translate(196 170)">
        <PaintCan size={64} />
      </g>
    </svg>
  );
}
