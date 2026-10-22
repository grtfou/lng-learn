import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs';
import packageJson from '../../../../package.json';

export const schedulerInfo = {
  name: 'ts-fsrs', version: packageJson.dependencies['ts-fsrs'],
  config: generatorParameters({ request_retention: 0.9, enable_fuzz: false, maximum_interval: 36500 }),
};
const scheduler = fsrs(schedulerInfo.config);

export function newState(now: Date): Card { return createEmptyCard(now); }

export function restoreState(serialized: string): Card {
  const value = JSON.parse(serialized) as Card;
  return {
    ...value, due: new Date(value.due),
    last_review: value.last_review ? new Date(value.last_review) : undefined,
  };
}

export function schedule(serialized: string, rating: Grade, now: Date) {
  return scheduler.next(restoreState(serialized), now, rating);
}
