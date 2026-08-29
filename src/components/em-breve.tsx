export default function EmBreve({
  titulo,
  sprint,
  descricao,
}: {
  titulo: string;
  sprint: string;
  descricao: string;
}) {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {titulo}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{descricao}</p>
      </header>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-700">Chega na {sprint}</p>
        <p className="mt-1 text-sm text-slate-500">
          A fundação já está pronta: esta tela entra quando o gate da sprint
          anterior passar.
        </p>
      </div>
    </>
  );
}
