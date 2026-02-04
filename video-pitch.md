# Stride - Video Pitch Script

> **Duration**: 2:45 max | **Language**: English | **Tone**: Confident, human, slightly irreverent

---

## Synopsis (30 seconds read)

**Stride** is a student financial navigator that breaks the "hustle harder" pattern. Instead of telling students to work more, it tells them to work *smarter*—and sometimes to take a nap. Built with Opik observability, every AI recommendation is traceable and auditable.

**Core insight**: Students don't fail financially because they're lazy. They fail because they're exhausted. Stride treats energy as currency.

---

## Video Structure

### HOOK (0:00 - 0:15)

**[Screen: Dark, then app opens]**

> "Every budgeting app tells you the same thing: spend less, earn more.
>
> But what if you're a student working 20 hours a week, studying for finals, and running on 4 hours of sleep?
>
> *Spend less* isn't advice. It's a joke."

**[Cut to Stride logo]**

> "This is Stride. The first financial AI that might tell you to take a nap."

---

### THE PROBLEM (0:15 - 0:35)

**[Screen: Quick montage of generic budget apps]**

> "Budgeting apps treat everyone the same. Fixed income, fixed expenses, optimize.
>
> But students live in chaos. Exams hit. Energy crashes. That tutoring gig you planned? You can't do it when you're running on empty."

**[Screen: Energy graph going down]**

> "We tracked this. Students who push through exhaustion don't save more. They burn out and quit their side hustles entirely.
>
> The ROI of rest is real."

---

### THE SOLUTION - 4 FEATURES (0:35 - 1:45)

**[Screen: Swipe interface]**

#### Feature 1: Swipe Scenarios (15s)

> "Swipe Scenarios. Think Tinder, but for financial decisions.
>
> Should you sell your old iPhone or keep tutoring? Swipe right on what feels doable. The AI learns your preferences—effort tolerance, rate sensitivity, flexibility needs—without you filling out forms."

**[Screen: Job recommendations with scores]**

#### Feature 2: Skill Arbitrage (15s)

> "Skill Arbitrage. Not all jobs are equal.
>
> Python freelancing pays $25/hour but drains you. SQL coaching pays $22 but feels easy. Stride scores jobs on rate, effort, demand, AND your energy reserves.
>
> Sometimes the 'lower paying' job is the smarter choice."

**[Screen: Comeback alert notification]**

#### Feature 3: Comeback Mode (15s)

> "Comeback Mode. We detect when you recover.
>
> After exams, your energy spikes. Stride sees this and says: 'You've got a 2-week window. Here's a realistic catch-up plan.'
>
> Not guilt. Just math."

**[Screen: Energy debt warning with reduced target]**

#### Feature 4: Energy Debt (15s)

> "Energy Debt. Three weeks of low energy? Stride doesn't lecture you.
>
> It automatically reduces your savings target. Because an impossible goal isn't a goal—it's a source of anxiety.
>
> And when you recover? Achievement unlocked: Self-Care Champion."

**[Screen: Achievement popup with confetti]**

---

### THE SECRET SAUCE - OPIK (1:45 - 2:15)

**[Screen: Opik dashboard with traces]**

> "Here's what makes Stride different under the hood: every single recommendation is traceable.
>
> Using Opik, we log WHY the AI suggested that job, HOW it calculated your comeback window, and WHAT data it used.
>
> This isn't a black box. It's an auditable system."

**[Screen: Guardian validation trace]**

> "We even have a Guardian agent—an AI that audits the AI. If a recommendation fails safety checks, the user never sees it.
>
> LLM-as-a-Judge. Transparent. Accountable."

**[Screen: Feedback buttons → Opik trace]**

> "And when users give feedback—thumbs up, thumbs down—it flows back into Opik. Human-in-the-loop, fully traced."

---

### THE CLOSE (2:15 - 2:45)

**[Screen: Progress dashboard with missions]**

> "Stride isn't about making students work harder.
>
> It's about making their work count. Matching effort to energy. Turning burnout into comebacks."

**[Screen: App logo + tagline]**

> "Navigate student life, one smart step at a time.
>
> **Stride**. Because the best financial advice might be: 'Get some sleep.'"

**[Screen: Live demo URL + GitHub]**

> "Try it now. Link in description."

---

## Key Talking Points (for improvisation)

If asked about:

| Topic | Answer |
|-------|--------|
| **Why Opik?** | "Full observability. Every trace shows the reasoning. Judges—or users—can audit any decision." |
| **Why not just use GPT?** | "We do use LLMs (Groq). But the algorithms (Energy Debt, Comeback) are deterministic. LLMs help interpret, not decide." |
| **Privacy?** | "DuckDB runs locally. Profile data stays on device. LLM calls are ephemeral." |
| **Business model?** | "Freemium. Free for students. Premium for universities wanting aggregate insights (anonymized)." |
| **Tech stack?** | "SolidStart frontend, Mastra agents, DuckDB storage, Groq LLM, Opik tracing. All open-source friendly." |

---

## B-Roll Suggestions

1. **Swipe interaction** - Close-up of cards swiping left/right
2. **Energy graph** - Animated line going down, then up (comeback)
3. **Opik traces** - Real dashboard showing span hierarchy
4. **Achievement popup** - Confetti moment
5. **Bruno avatar** - Chat interaction with personality

---

## Do NOT Say

- "Revolutionary" / "Disruptive" (overused)
- "AI-powered" without context (everyone says this)
- "Budget app" (we're a navigator, not a tracker)
- Time estimates ("this took X hours")

## DO Say

- "Traceable" / "Auditable" (Opik differentiator)
- "Energy as currency" (core insight)
- "Work smarter, not harder" (anti-hustle positioning)
- "The AI that tells you to rest" (memorable hook)

---

## Recording Checklist

- [ ] Screen recording: 1080p minimum, smooth scrolling
- [ ] Voiceover: Clear, confident, not rushed
- [ ] Music: Lo-fi or ambient (not distracting)
- [ ] Captions: Burn in English subtitles
- [ ] End card: URL + "Built for Encode Club Hackathon 2026"
