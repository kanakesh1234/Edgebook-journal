/**
 * Error notices ("my reasoning engine is unreachable…") are shown in the chat but are NOT something Minato said.
 * They must never be replayed to the model as its own earlier turn — that poisons every later answer.
 */
const LEGACY_FAILURE = /^(My reasoning engine |I couldn't reach (my reasoning engine|the server)|Something went wrong (on my side|while I was thinking)|The (connection dropped|answer was cut off)|I couldn't load your journal)/;

export const isFailedReply = (m: { role: string; text: string; isError?: boolean }): boolean =>
  m.role === "buddy" && (m.isError === true || LEGACY_FAILURE.test(m.text));
