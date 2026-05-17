export function buildRenderCaption(hook: string, campaignCaption: string | null) {
  if (!campaignCaption) {
    return hook;
  }

  return `${hook}\n\n${campaignCaption}`;
}
