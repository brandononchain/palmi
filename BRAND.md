# Palmi Brand Guidelines & Design System

This document serves as the source of truth for the palmi design system and brand toolkit to ensure consistency across the application and landing pages.

## 1. Logo & Tagline

- **Name:** palmi
- **Tagline:** "a quiet place for your people"

## 2. Brand Essence & Tone

- **Mission:** "Small circles. No noise. Just your people." Palmi is a quiet social layer for real relationships. No followers, no algorithm, no noise.
- **Tone:** Calm, thoughtful, intimate, understated.
- **We Are:** Intentional, human, minimal, trustworthy.
- **We Are Not:** Loud, performative, addictive, noisy.
- **Brand Principles:**
  - Remove over add
  - Calm over hype
  - Intimacy over scale
  - Presence over performance
  - Designed for real relationships

## 3. Color Palette

Use these exact hex codes for CSS/Tailwind variables matching the brandkit.

### Backgrounds

- `--bg`: `#FAF9F6` (Main page background)
- `--bg-panel`: `#F4F1EB` (Surface, cards, panels)

### Text / Ink

- `--ink`: `#1A1A1A` (Primary text, headings)
- `--ink-muted`: `#6B6760` (Secondary text, descriptions)
- `--ink-faint`: `#A5A099` (Placeholder text, subtle icons)

### Borders

- `--border`: `#E8E4DE` (Subtle dividers)
- `--border-strong`: `#D8D3CB` (Active borders, prominent dividers)

### Accents (Buttons, Links, Highlights)

- `--accent`: `#D65745` (Rust/Orange-Red)
- `--accent-hover`: `#BE4A38`

## 4. Typography

- **Serif (Headlines, key moments, and voice):** `Fraunces` (Weight: 400)
  - Heading 1: 76px / 82px line-height
  - Heading 2: 44px / 52px line-height
- **Sans-Serif (UI, body text, and everyday use):** `Inter` (Weight: 400)
  - Body Large: 19px / 28px line-height
  - Body: 16px / 24px line-height
  - Small / Meta: 13px / 20px line-height

## 5. UI Components

### Buttons

- **Primary:** Dark background (`--ink`), white text. Fully rounded (pill shape).
- **Primary Hover:** Accent background (`--accent-hover`), white text.
- **Secondary:** White/transparent background, `--ink` border and text.
- **Text Link:** `--accent` text color with underline.

### Input Fields

- Fully rounded (pill shape) borders.
- Border color: `--border`, text color: `--ink`.
- Active/Focus State: Thicker or darker border (`--border-strong` or `--ink`), neutral background.

### Application Style

- UI should feel warm, calm, and natural.
- Lots of whitespace, minimal heavy UI framing.
- Imagery style: Warm, calm, natural. Intimate moments over grand gestures (neutral tones, natural lighting, warm shadows).
