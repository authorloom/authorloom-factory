export type ProductionMediaKind = "still" | "video" | "audio";

export type MediaSourceAsset = {
  assetId: string;
  type: string;
  filename?: string | null;
  sourceUrl?: string | null;
  originalUrl?: string | null;
  renderSourceUrl?: string | null;
  previewUrl?: string | null;
  previewMimeType?: string | null;
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
  driveFileId?: string | null;
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
  "outro", "poster", "screenshot", "slides", "still", "thumbnail",
]);
const textTypes = new Set([
  "caption", "captions", "cta", "hashtag", "hashtags", "hook", "keyword", "keywords", "magiclink", "manuscript", "metadata",
  "slidehookgroup", "text", "title", "trope", "tropes",
]);
const containerTypes = new Set(["slidebackgroundgroup"]);
const videoExtensions = new Set([".m4v", ".mov", ".mp4", ".webm"]);

export type AssetDisposition = "media" | "text" | "container";

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

export function assetDisposition(type?: string | null): AssetDisposition {
  const value = normalized(type);
  if (textTypes.has(value)) return "text";
  if (containerTypes.has(value)) return "container";
  return "media";
}

function extensionFromUrl(value?: string | null) {
  if (!value) return "";
  try {
    const pathname = new URL(value, "https://authorloom.invalid").pathname.toLowerCase();
    const match = pathname.match(/\.[a-z0-9]+$/);
    return match?.[0] ?? "";
  } catch {
    return "";
  }
}

function provenVideoPreview(asset: MediaSourceAsset) {
  return kindFromMime(asset.previewMimeType) === "video" ||
    videoExtensions.has(extensionFromUrl(asset.previewUrl));
}

function explicitKind(asset: MediaSourceAsset): ProductionMediaKind | null {
  const value = normalized(asset.canonicalMediaKind ?? asset.mediaKind);
  if (["still", "image", "screenshot", "cover"].includes(value)) return "still";
  if (["video", "clip", "backgroundvideo"].includes(value)) return "video";
  if (["audio", "music", "voiceover"].includes(value)) return "audio";
  return null;
}

export function mediaKindForAsset(asset: MediaSourceAsset): ProductionMediaKind {
  const disposition = assetDisposition(asset.type);
  if (disposition !== "media") {
    throw new Error(
      `Asset ${asset.assetId} is ${disposition === "text" ? "text-only" : "a container"} and is not a production media source.`,
    );
  }
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
    const previewUrl = clean(asset.previewUrl);
    if (
      kind === "video" &&
      previewUrl &&
      !renderSourceUrl &&
      !sourceUrl &&
      !provenVideoPreview(asset) &&
      !clean(asset.driveFileId)
    ) {
      throw new Error(
        `Legacy video asset ${asset.assetId} has only an image or ambiguous preview URL; a video source, render source, or Drive fallback is required.`,
      );
    }
    return {
      kind,
      purpose: "legacy",
      mediaId: null,
      url: kind === "audio"
        ? clean(asset.audioUrl) ?? renderSourceUrl ?? sourceUrl ?? clean(asset.previewUrl)
        : renderSourceUrl ?? sourceUrl ?? (provenVideoPreview(asset) ? previewUrl : null),
      mimeType: clean(asset.renderSourceMimeType) ?? clean(asset.sourceMimeType),
    };
  }

  if (
    normalized(asset.type) === "screenshot" &&
    renderSourceId &&
    kindFromMime(asset.renderSourceMimeType) === "still" &&
    normalized(asset.renderSourceMimeType) === "imagejpeg"
  ) {
    return { kind, purpose: "renderSource", mediaId: renderSourceId, url: renderSourceUrl, mimeType: clean(asset.renderSourceMimeType) };
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
