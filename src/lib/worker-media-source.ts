export type WorkerMediaAsset = {
  sourceMediaId?: string | null;
  renderSourceMediaId?: string | null;
  previewMediaId?: string | null;
  thumbnailMediaId?: string | null;
};

export function preferredWorkerMediaId(asset: WorkerMediaAsset) {
  return (
    asset.sourceMediaId ??
    asset.renderSourceMediaId ??
    asset.previewMediaId ??
    asset.thumbnailMediaId ??
    null
  );
}
