import { redirect } from "next/navigation";

type EditBookPageProps = {
  params: Promise<{
    bookId: string;
  }>;
};

export default async function EditBookPage({ params }: EditBookPageProps) {
  const { bookId } = await params;

  redirect(`/books/${bookId}`);
}
