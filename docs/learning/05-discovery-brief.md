# Step 05 (Task 1): Discovery brief

## 1. Goal

Decide **what problem we solve, for whom, and how we know it works** before building AI features.
Output: [docs/discovery-brief.md](../discovery-brief.md).

## 2. What we built

A one-page brief with: user, pain point, success metric (plus supporting metrics with targets),
approval rules for agent actions, constraints, risks with mitigations, out of scope, and open
questions. It is a **draft**: assumptions are marked **[A]**.

## 3. Why this way

- **Most AI projects fail because of the problem definition, not the model.** A clear user,
  pain point and metric stop us building a clever demo nobody needs.
- **One north-star metric** (time to first response) keeps decisions simple: "does this change make
  agents faster without hurting quality?" Supporting metrics stop us "winning" the main metric by
  cheating (for example, fast but wrong answers).
- **Every metric is linked to a task.** Accuracy and groundedness become evals (task 7), latency
  and cost become dashboard numbers (task 10). The brief is the spec for later tests.
- **Assistant, not autopilot.** The AI suggests; a human approves and sends. This is the safest
  way to start: we can measure quality on real work before giving the AI more freedom.
- **Approval rules per action**: read-only tools are free; anything that changes data needs
  approval; some actions are never allowed. This is the design for the agent in task 4.
- **Out of scope is written down** so the project does not grow without control (scope creep).
- **Assumptions are marked, not hidden.** When there is no client to ask, write your best guess,
  label it, and list the open questions.

## 4. How it works (how to run discovery in a real job)

1. Interview users (agents, team leads): "walk me through your last 5 tickets".
2. Look at real data: volume, ticket types, response times.
3. Pick one metric and its baseline.
4. Define what the AI may and may not do.
5. List risks and how to reduce each one.
6. Write what is out of scope.
7. Get sign-off. Then build.

## 5. Try it yourself

- Read [docs/discovery-brief.md](../discovery-brief.md) and answer the 5 open questions at the end.
- Exercise: change the north-star metric to "routing accuracy". Which tasks change first?

## 6. Problems we faced

| Problem                              | Cause                               | Fix                                                                | Lesson                                                            |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| No interview answers and no data yet | Learning project, CSV not added yet | Wrote a draft with labelled assumptions **[A]** and open questions | Don't wait: write assumptions down and get them confirmed         |
| Baseline numbers unknown             | No dataset yet                      | Marked "measure from the dataset"                                  | A target without a baseline is a guess; fill it when data arrives |

## 7. Interview questions

**Q: How do you start a Gen AI project for a client?**
Discovery: understand the user and the pain, pick one success metric with a baseline, define what
the AI can and cannot do, list risks, agree on scope. Then build a small version and measure.

**Q: Why not let the AI send replies automatically?**
Risk. Start human-in-the-loop, measure quality (acceptance rate, groundedness), and automate only
the cases that are proven safe.

**Q: What is a north-star metric? Why also supporting metrics?**
The one number that shows real value. Supporting (guardrail) metrics stop you improving it in a bad
way, for example faster replies that are wrong.

**Q: How do you choose which actions need human approval?**
By impact and reversibility. Read-only = no approval. Changes to data = approval. Irreversible or
high-impact (refunds, deletion, sending to customers) = not allowed for the AI.

**Q: What is automation bias?**
People trust the machine too much and stop checking. Reduce it with citations, confidence
signals, and by measuring how often humans edit or reject suggestions.

## 8. Key takeaways

- Problem, user, metric first. Model last.
- Every metric must be measurable and linked to a test or dashboard.
- Write assumptions and out-of-scope items down.
