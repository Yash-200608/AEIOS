import {
  Activity,
  Box,
  CalendarDays,
  CloudFog,
  Flame,
  Globe2,
  Layers3,
  RadioTower,
  Satellite,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/*
 * The command center's views, in navigation order. The order is also the transition direction: moving down this list
 * slides the stage up, moving up slides it down. Ids are the page-section ids used before views existed, so legacy
 * links (#station) keep working.
 */
export type ViewId =
  | 'overview'
  | 'air-quality'
  | 'dispersion'
  | 'twin'
  | 'forecast'
  | 'smoke'
  | 'satellite'
  | 'atmosphere'
  | 'simulation'
  | 'aeios'
  | 'station';

export type ViewGroup = 'MONITOR' | 'EXPLORE' | 'TOOLS' | 'INFRASTRUCTURE';

export type ViewDef = {
  id: ViewId;
  label: string;
  group: ViewGroup;
  icon: LucideIcon;
  /** One honest sentence: the question this view answers and the kind of evidence it shows. */
  subtitle: string;
  /**
   * The view shows the regional weather model run loaded by the shell. Its hero band then states when that run is a cached
   * (stale) one, so the currency label is visible in the view itself, not only on the Overview.
   */
  weatherModel?: true;
};

export const VIEWS: readonly ViewDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    group: 'MONITOR',
    icon: Activity,
    subtitle: 'The current dispersion situation at the selected site, with the evidence behind it.',
  },
  {
    id: 'air-quality',
    label: 'Air quality',
    group: 'MONITOR',
    icon: Wind,
    subtitle: 'Regional CAMS model estimates of particulates and other pollutants for this grid cell. Modelled, not measured at the site.',
  },
  {
    id: 'dispersion',
    label: 'Pollution dispersion',
    group: 'MONITOR',
    icon: CloudFog,
    subtitle: 'Whether the air near the ground can mix and carry pollution away, hour by hour, from the regional weather model.',
    weatherModel: true,
  },
  {
    id: 'twin',
    label: '3D dispersion twin',
    group: 'MONITOR',
    icon: Box,
    subtitle: 'Where a hypothetical release would drift under modelled winds. A scenario simulation, not an observation.',
  },
  {
    id: 'forecast',
    label: 'Forecast',
    group: 'EXPLORE',
    icon: CalendarDays,
    subtitle: 'Temperature, rain and wind for the coming days from the regional numerical weather model.',
    weatherModel: true,
  },
  {
    id: 'smoke',
    label: 'Smoke origin',
    group: 'EXPLORE',
    icon: Flame,
    subtitle: 'Where the air arriving here came from, traced back and compared with satellite fire detections.',
  },
  {
    id: 'satellite',
    label: 'Satellite',
    group: 'EXPLORE',
    icon: Satellite,
    subtitle: 'Satellite imagery, aerosol and fire layers around the sites: a different class of evidence from station or model data.',
  },
  {
    id: 'atmosphere',
    label: '3D atmosphere',
    group: 'EXPLORE',
    icon: Globe2,
    subtitle: 'A 3D view of the modelled wind, cloud and rain fields above the site for the selected forecast hour.',
    weatherModel: true,
  },
  {
    id: 'simulation',
    label: 'Simulation lab',
    group: 'TOOLS',
    icon: Layers3,
    subtitle: 'What-if perturbations of the forecast baseline. Simulation only: results never replace forecasts or measurements.',
    weatherModel: true,
  },
  {
    id: 'aeios',
    label: 'AEIOS model',
    group: 'INFRASTRUCTURE',
    icon: Zap,
    subtitle: "What the AEIOS sensor nodes have reported, and the gateway's node-based PM2.5 forecast when one has been uploaded.",
  },
  {
    id: 'station',
    label: 'Station network',
    group: 'INFRASTRUCTURE',
    icon: RadioTower,
    subtitle: 'Where the observation sites are and what the physical station has actually reported.',
  },
];

export const VIEW_IDS: readonly ViewId[] = VIEWS.map((v) => v.id);
export const DEFAULT_VIEW: ViewId = 'overview';

export const VIEW_BY_ID = Object.fromEntries(VIEWS.map((v) => [v.id, v])) as Record<ViewId, ViewDef>;

/** Ids of sections that live inside a view (old deep links such as #pm-forecast open the view that holds them). */
export const VIEW_ALIASES: Readonly<Record<string, ViewId>> = { 'pm-forecast': 'aeios' };

const GROUP_LABEL: Record<ViewGroup, string> = {
  MONITOR: 'Monitor',
  EXPLORE: 'Explore',
  TOOLS: 'Tools',
  INFRASTRUCTURE: 'Infrastructure',
};

/** The sidebar's groups, in order, each with its views. */
export const VIEW_GROUPS: readonly { group: ViewGroup; label: string; views: readonly ViewDef[] }[] = (
  ['MONITOR', 'EXPLORE', 'TOOLS', 'INFRASTRUCTURE'] as const
).map((group) => ({ group, label: GROUP_LABEL[group], views: VIEWS.filter((v) => v.group === group) }));
