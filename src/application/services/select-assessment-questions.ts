import { randomInt } from "node:crypto";
import type { MultipleChoiceQuestion } from "@/domain/question";

export type RandomIndex = (upperBoundExclusive: number) => number;

export function selectAssessmentQuestions(
  questions: readonly MultipleChoiceQuestion[],
  count: number,
  randomIndex: RandomIndex = (upperBound) => randomInt(upperBound),
): MultipleChoiceQuestion[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError("Question count must be a positive integer.");
  }
  const seenIds = new Set<string>();
  const available = questions.filter((question) => {
    if (
      question.status !== "valid" ||
      question.correctOption === null ||
      seenIds.has(question.id)
    ) {
      return false;
    }
    seenIds.add(question.id);
    return true;
  });
  if (count > available.length) {
    throw new RangeError("Requested question count exceeds the available valid questions.");
  }

  const pool = [...available];
  for (let index = 0; index < count; index += 1) {
    const range = pool.length - index;
    const randomOffset = randomIndex(range);
    if (!Number.isInteger(randomOffset) || randomOffset < 0 || randomOffset >= range) {
      throw new RangeError("Random index generator returned a value outside its range.");
    }
    const selectedIndex = index + randomOffset;
    [pool[index], pool[selectedIndex]] = [pool[selectedIndex], pool[index]];
  }
  return pool.slice(0, count);
}
