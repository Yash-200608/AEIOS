import Overview, { type OverviewProps } from '../components/overview/Overview';
import { ViewRoot } from './shared';

/** The evidence behind the command deck's headline: the full Overview (assessment, limits, criteria, outlook, context). */
export default function BriefingView({ overview }: { overview: OverviewProps }) {
  return (
    <ViewRoot id="briefing" ownsId={false}>
      <Overview {...overview} />
    </ViewRoot>
  );
}
