import Link from "next/link";
import type { AssessmentResult } from "@/domain/assessment";
import { ThemeToggle } from "@/components/ui/theme-toggle";

type AssessmentResultsProps = {
  result: AssessmentResult;
};

function outcomeLabel(outcome: AssessmentResult["questions"][number]["outcome"]) {
  if (outcome === "correct") return "Correct";
  if (outcome === "incorrect") return "Incorrect";
  return "Unanswered";
}

export function AssessmentResults({ result }: AssessmentResultsProps) {
  return (
    <main className="site-shell results-shell">
      <header className="review-masthead">
        <Link className="wordmark" href="/" aria-label="MCQForge home">
          <span className="wordmark-mark" aria-hidden="true">M</span>
          <span>MCQ<span className="wordmark-light">FORGE</span></span>
        </Link>
        <div className="masthead-actions">
          <ThemeToggle />
          <span className="status-label">FINAL RESULTS</span>
        </div>
      </header>

      <section className="results-intro" aria-labelledby="results-title">
        <div className="results-heading">
          <p className="eyebrow"><span>05</span> ASSESSMENT / REVIEW</p>
          <h1 id="results-title">{result.correct}<span>/{result.totalQuestions}</span></h1>
          <p className="results-score-label">CORRECT ANSWERS</p>
        </div>
        <div className="results-percentage" aria-label={`Final score ${result.percentage} percent`}>
          <strong>{result.percentage}<span>%</span></strong>
          <span>FINAL SCORE</span>
        </div>
      </section>

      <p className="results-completion" role="status">
        {result.timedOut
          ? "Time expired · your server-saved answers have been finalized."
          : "Test submitted · your answers have been finalized."}
      </p>

      <dl className="results-totals" aria-label="Score summary">
        <div className="total-correct">
          <dt>Correct</dt>
          <dd>{result.correct}</dd>
        </div>
        <div className="total-incorrect">
          <dt>Incorrect</dt>
          <dd>{result.incorrect}</dd>
        </div>
        <div className="total-unanswered">
          <dt>Unanswered</dt>
          <dd>{result.unanswered}</dd>
        </div>
        <div className="total-completion">
          <dt>Completion</dt>
          <dd>{result.totalQuestions} questions</dd>
        </div>
      </dl>

      <section className="results-review" aria-labelledby="review-title">
        <div className="results-review-heading">
          <div>
            <p className="eyebrow">QUESTION BY QUESTION</p>
            <h2 id="review-title">Review your answers.</h2>
          </div>
          <span>{result.totalQuestions} ITEMS</span>
        </div>
        <ol className="results-question-list">
          {result.questions.map((question, index) => (
            <li
              className={`results-question ${question.outcome}`}
              key={`${question.questionId}-${index}`}
            >
              <div className="results-question-topline">
                <span className="results-question-number">
                  {String(index + 1).padStart(2, "0")}
                  {question.sourceNumber ? ` · SOURCE ${question.sourceNumber}` : ""}
                </span>
                <strong className={`results-outcome ${question.outcome}`}>
                  {outcomeLabel(question.outcome)}
                </strong>
              </div>
              <h3>{question.prompt}</h3>
              <ul className="results-option-list">
                {(["A", "B", "C", "D"] as const).map((option) => {
                  const isUserAnswer = question.userAnswer === option;
                  const isCorrectAnswer = question.correctAnswer === option;
                  return (
                    <li
                      className={[
                        "results-option",
                        isUserAnswer ? " user-answer" : "",
                        isCorrectAnswer ? " correct-answer" : "",
                      ].join("")}
                      key={option}
                    >
                      <span className="results-option-letter">{option}</span>
                      <span className="results-option-text">{question.options[option]}</span>
                      <span className="results-option-label">
                        {isUserAnswer && isCorrectAnswer
                          ? "Your answer · Correct answer"
                          : isUserAnswer
                            ? "Your answer"
                            : isCorrectAnswer
                              ? "Correct answer"
                              : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {question.userAnswer === null && (
                <p className="results-answer-note">Your answer: No answer selected.</p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <footer className="results-footer">
        <p>Score uses one point per correct answer. Incorrect and unanswered answers receive zero points.</p>
        <Link className="results-new-test" href="/">
          <span>Start new test</span>
          <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </main>
  );
}
