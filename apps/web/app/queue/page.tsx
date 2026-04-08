import { redirect } from 'next/navigation';
import { buildAppTaskHref } from '../../lib/v3-ui';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function QueueRoutePage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const highlight = firstValue(searchParams.highlight);
  const published = firstValue(searchParams.published);
  const intent = firstValue(searchParams.intent);
  const nextAction = intent === 'confirm_publish' ? 'confirm_publish' : 'open_queue';

  redirect(buildAppTaskHref(nextAction, { highlight, published }) ?? '/app');
}
