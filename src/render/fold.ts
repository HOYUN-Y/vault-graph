// Size and label rules for collapsed clusters (large graphs). Pure, shared by the scene (BrainScene) and tests.
/** Collapsed cluster scale: log of the child count (capped so clusters of thousands don't cover other nodes) */
export const foldScale = (count: number) => Math.min(2.4, 1 + 0.3 * Math.log10(1 + count));
/** Label text: a collapsed cluster gets +count after its title */
export const labelText = (title: string, count: number | undefined) => (count ? `${title} +${count.toLocaleString('en-US')}` : title);
