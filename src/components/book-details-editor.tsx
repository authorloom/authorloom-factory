"use client";

import Link from "next/link";
import { useState } from "react";

import { SubmitButton } from "@/components/submit-button";

type FormAction = (formData: FormData) => void | Promise<void>;

type AuthorSummary = {
  id: string;
  name: string;
};

type SeriesSummary = {
  id: string;
  name: string;
};

type TropeSummary = {
  id: string;
  trope: string;
};

type EditMode = "title" | "series" | "tropes" | "description" | null;

type BookEditorProps = {
  title: string;
  description: string | null;
  author: AuthorSummary | null;
  seriesId: string | null;
  seriesName: string | null;
  seriesOptions: SeriesSummary[];
  tropes: TropeSummary[];
  updateTitleAction: FormAction;
  updateSeriesAction: FormAction;
  updateTropesAction: FormAction;
  updateDescriptionAction: FormAction;
};

type ModalState = {
  editMode: EditMode;
  setEditMode: (mode: EditMode) => void;
};

const inputClassName =
  "min-h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none transition focus:border-rose-700 focus:ring-2 focus:ring-rose-100";

const labelClassName = "text-sm font-medium text-zinc-500";

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M4 14.5V16h1.5L15 6.5 13.5 5 4 14.5Z" />
      <path d="m12.5 6 1.5 1.5" />
    </svg>
  );
}

function IconEditButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800 active:translate-y-px"
    >
      <PencilIcon />
    </button>
  );
}

function EditorModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/35 px-4 py-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-editor-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
              Book detail
            </p>
            <h2
              id="book-editor-title"
              className="mt-1 text-xl font-semibold text-zinc-950"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 active:translate-y-px"
          >
            Close
          </button>
        </div>
        <div className="pt-5">{children}</div>
      </div>
    </div>
  );
}

function BookEditModals({
  title,
  description,
  seriesId,
  seriesOptions,
  tropes,
  updateTitleAction,
  updateSeriesAction,
  updateTropesAction,
  updateDescriptionAction,
  editMode,
  setEditMode,
}: BookEditorProps & ModalState) {
  const tropeText = tropes.map((trope) => trope.trope).join(", ");

  return (
    <>
      {editMode === "title" ? (
        <EditorModal title="Edit title" onClose={() => setEditMode(null)}>
          <form action={updateTitleAction} className="grid gap-4">
            <label className="grid gap-2">
              <span className={labelClassName}>Title</span>
              <input
                name="title"
                required
                defaultValue={title}
                className={inputClassName}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditMode(null)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:translate-y-px"
              >
                Cancel
              </button>
              <SubmitButton pendingLabel="Saving..." savedLabel="Saved">
                Save title
              </SubmitButton>
            </div>
          </form>
        </EditorModal>
      ) : null}

      {editMode === "series" ? (
        <EditorModal title="Edit series" onClose={() => setEditMode(null)}>
          <form action={updateSeriesAction} className="grid gap-4">
            <label className="grid gap-2">
              <span className={labelClassName}>Series</span>
              <select
                name="seriesId"
                defaultValue={seriesId ?? ""}
                className={inputClassName}
              >
                <option value="">Standalone / no series</option>
                {seriesOptions.map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.name}
                  </option>
                ))}
                <option value="__new__">Create new series below</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className={labelClassName}>New series name</span>
              <input
                name="newSeriesName"
                placeholder="Use this only when creating a new series"
                className={inputClassName}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditMode(null)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:translate-y-px"
              >
                Cancel
              </button>
              <SubmitButton pendingLabel="Saving..." savedLabel="Saved">
                Save series
              </SubmitButton>
            </div>
          </form>
        </EditorModal>
      ) : null}

      {editMode === "tropes" ? (
        <EditorModal title="Edit tropes" onClose={() => setEditMode(null)}>
          <form action={updateTropesAction} className="grid gap-4">
            <label className="grid gap-2">
              <span className={labelClassName}>Tropes</span>
              <input
                name="tropes"
                defaultValue={tropeText}
                placeholder="enemies to lovers, forbidden romance"
                className={inputClassName}
              />
            </label>
            <p className="text-sm leading-6 text-zinc-500">
              Separate tropes with commas.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditMode(null)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:translate-y-px"
              >
                Cancel
              </button>
              <SubmitButton pendingLabel="Saving..." savedLabel="Saved">
                Save tropes
              </SubmitButton>
            </div>
          </form>
        </EditorModal>
      ) : null}

      {editMode === "description" ? (
        <EditorModal title="Edit book blurb" onClose={() => setEditMode(null)}>
          <form action={updateDescriptionAction} className="grid gap-4">
            <label className="grid gap-2">
              <span className={labelClassName}>Book blurb</span>
              <textarea
                name="description"
                rows={12}
                defaultValue={description ?? ""}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-rose-700 focus:ring-2 focus:ring-rose-100"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditMode(null)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 active:translate-y-px"
              >
                Cancel
              </button>
              <SubmitButton pendingLabel="Saving..." savedLabel="Saved">
                Save blurb
              </SubmitButton>
            </div>
          </form>
        </EditorModal>
      ) : null}
    </>
  );
}

export function BookHeaderEditor(props: BookEditorProps) {
  const [editMode, setEditMode] = useState<EditMode>(null);
  const { title, author, seriesName, tropes } = props;

  return (
    <>
      <div className="max-w-4xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">
          Book dashboard
        </p>
        <div className="flex items-start gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">
            {title}
          </h1>
          <IconEditButton
            label="Edit title"
            onClick={() => setEditMode("title")}
          />
        </div>

        <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-700">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-950">
              {seriesName ?? "Standalone"}
            </span>
            <IconEditButton
              label="Edit series"
              onClick={() => setEditMode("series")}
            />
          </div>
          <p>
            By{" "}
            {author ? (
              <Link
                href={`/authors/${author.id}`}
                className="font-medium text-rose-700 underline"
              >
                {author.name}
              </Link>
            ) : (
              <span className="font-medium text-zinc-950">Unknown author</span>
            )}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {tropes.length > 0 ? (
            tropes.map((trope) => (
              <span
                key={trope.id}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700"
              >
                {trope.trope}
              </span>
            ))
          ) : (
            <span className="text-sm text-zinc-500">No tropes saved yet.</span>
          )}
          <IconEditButton
            label="Edit tropes"
            onClick={() => setEditMode("tropes")}
          />
        </div>
      </div>

      <BookEditModals {...props} editMode={editMode} setEditMode={setEditMode} />
    </>
  );
}

export function BookBlurbEditor(props: BookEditorProps) {
  const [editMode, setEditMode] = useState<EditMode>(null);
  const { description } = props;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-950">Book blurb</h2>
        <IconEditButton
          label="Edit book blurb"
          onClick={() => setEditMode("description")}
        />
      </div>
      {description ? (
        <div className="mt-4 max-h-[34rem] overflow-y-auto whitespace-pre-line pr-2 text-sm leading-7 text-zinc-700">
          {description}
        </div>
      ) : (
        <p className="mt-4 text-sm text-zinc-500">
          No description saved yet.
        </p>
      )}

      <BookEditModals {...props} editMode={editMode} setEditMode={setEditMode} />
    </section>
  );
}
