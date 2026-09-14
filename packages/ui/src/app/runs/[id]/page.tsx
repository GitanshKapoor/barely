import ClientRunDetails from './ClientRunDetails';

export default async function RunDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = resolvedParams.id;

  return <ClientRunDetails id={id} />;
}
