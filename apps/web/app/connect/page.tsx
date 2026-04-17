import { redirect } from 'next/navigation';
import { buildAppTaskHref } from '../../lib/v3-ui';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConnectRoutePage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const intent = firstValue(searchParams.intent);
  const xbind = firstValue(searchParams.xbind);
  const nextAction = intent === 'rebuild_profile' || intent === 'connect_learning_source' || intent === 'connect_x_self'
    ? intent
    : 'connect_x_self';

  redirect(buildAppTaskHref(nextAction, { xbind }) ?? '/app');
}
