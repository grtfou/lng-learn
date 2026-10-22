import { DemoContentProvider } from './demo-content';
import { DictionaryContentProvider } from './dictionary-content';
import { FreeDictionaryProvider } from './free-dictionary';

export function configuredProvider(name = 'free-dictionary') {
  if (name === 'demo') return new DemoContentProvider();
  if (name === 'free-dictionary') return new DictionaryContentProvider(new FreeDictionaryProvider());
  throw new Error('CONTENT_PROVIDER 僅接受 demo 或 free-dictionary');
}
