export type ProductionMediaKind = "still" | "video" | "audio";

export type MediaSourceAsset = {
  assetId: string;
  type: string;
  filename?: string | null;
  sourceUrl?: string | null;
  originalUrl?: string | null;
  renderSourceUrl?: string | null;
  previewUrl?: string | null;
  audioUrl?: string | null;
  sourceMediaId?: string | null;
  renderSourceMediaId?: string | null;
  previewMediaId?: string | null;
  thumbnailMediaId?: string | null;
  sourceMimeType?: string | null;
  renderSourceMimeType?: string | null;
  mediaKind?: string | null;
  canonicalMediaKind?: string | null;
  purpose?: string | null;
  renderSourcePurpose?: string | null;
};

export type SelectedMediaSource = {
  kind: ProductionMediaKind;
  purpose: "source" | "renderSource" | "legacy";
  mediaId: string | null;
  url: string | null;
  mimeType: string | null;
};

const videoTypes = new Set(["background", "backgroundvideo", "video", "videoclip", "clip"]);
const audioTypes = new Set(["audio", "audiotrack", "music", "voiceover"]);
const stillTypes = new Set([
  "backgroundimage", "bookcover", "cover", "coverimage", "image", "intro", "layoutimage",
  "outro", "poster", "screenshot", "still", "thumbnail",
]);

function normalized(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

function kindFromMime(mimeType?: string | null): ProductionMediaKind | null {
  const value = mimeType?.trim().toLowerCase() ?? "";
  if (value.startsWith("video/")) return "video";
  if (value.startsWith("image/")) return "still";
  if (value.startsWith("audio/")) return "audio";
  return null;
}

function explicitKind(asset: MediaSourceAsset): ProductionMediaKind | null {
  const value = normalized(asset.canonicalMediaKind ?? asset.mediaKind);
  if (["still", "image", "screenshot", "cover"].includes(value)) return "still";
  if (["video", "clip", "backgroundvideo"].includes(value)) return "video";
  if (["audio", "music", "voiceover"].includes(value)) return "audio";
  return null;
}

export function mediaKindForAsset(asset: MediaSourceAsset): ProductionMediaKind {
  const declaredKind = explicitKind(asset);
  const type = normalized(asset.type);
  const typeKind = videoTypes.has(type)
    ? "video"
    : audioTypes.has(type)
      ? "audio"
      : stillTypes.has(type)
        ? "still"
        : null;

  if (declaredKind && typeKind && declaredKind !== typeKind) {
    throw new Error(
      `Media asset ${asset.assetId} has mismatched kind metadata: type ${asset.type} is ${typeKind}, canonical kind is ${declaredKind}.`,
    );
  }
  if (declaredKind) return declaredKind;
  if (typeKind) return typeKind;

  const mimeKind = kindFromMime(asset.sourceMimeType ?? asset.renderSourceMimeType);
  if (mimeKind) return mimeKind;

  throw new Error(
    `Media asset ${asset.assetId} has unknown production media kind for type ${asset.type || "(missing)"}.`,
  );
}

function clean(value?: string | null) {
  return value?.trim() || null;
}

export function selectProductionMediaSource(asset: MediaSourceAsset): SelectedMediaSource {
  const kind = mediaKindForAsset(asset);
  const sourceId = clean(asset.sourceMediaId);
  const renderSourceId = clean(asset.renderSourceMediaId);
  const sourceUrl = clean(asset.sourceUrl) ?? clean(asset.originalUrl);
  const renderSourceUrl = clean(asset.renderSourceUrl);

  if (kind === "video" || kind === "audio") {
    if (renderSourceId) {
      return { kind, purpose: "renderSource", mediaId: renderSourceId, url: renderSourceUrl, mimeType: clean(asset.renderSourceMimeType) };
    }
    if (sourceId) {
      return { kind, purpose: "source", mediaId: sourceId, url: sourceUrl, mimeType: clean(asset.sourceMimeType) };
    }
    return {
      kind,
      purpose: "legacy",
      mediaId: null,
      url: kind === "audio"
        ? clean(asset.audioUrl) ?? renderSourceUrl ?? sourceUrl ?? clean(asset.previewUrl)
        : renderSourceUrl ?? sourceUrl ?? clean(asset.previewUrl),
      mimeType: clean(asset.renderSourceMimeType) ?? clean(asset.sourceMimeType),
    };
  }

  if (sourceId) {
    return { kind, purpose: "source", mediaId: sourceId, url: sourceUrl, mimeType: clean(asset.sourceMimeType) };
  }
  if (renderSourceId) {
    return { kind, purpose: "renderSource", mediaId: renderSourceId, url: renderSourceUrl, mimeType: clean(asset.renderSourceMimeType) };
  }
  return {
    kind,
    purpose: "legacy",
    mediaId: null,
    url: sourceUrl ?? renderSourceUrl ?? clean(asset.previewUrl),
    mimeType: clean(asset.sourceMimeType) ?? clean(asset.renderSourceMimeType),
  };
}
