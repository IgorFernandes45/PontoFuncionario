"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { salvarUnidade, excluirUnidade } from "../actions";
import { ESTADO_VAZIO } from "@/lib/form-state";

export type Unidade = {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  method: string;
  require_selfie: boolean;
  active: boolean;
};

export default function UnidadesLista({ unidades }: { unidades: Unidade[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-slate-900">
            Onde a equipe trabalha
          </h2>
          <p className="text-xs text-slate-500">
            O ponto por GPS só aceita batida dentro do raio da unidade.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCriando((v) => !v);
            setEditando(null);
          }}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {criando ? "Cancelar" : "Nova unidade"}
        </button>
      </div>

      {criando && <UnidadeForm aoTerminar={() => setCriando(false)} />}

      {unidades.length === 0 && !criando && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">
            Nenhuma unidade cadastrada
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre o local de trabalho para liberar o ponto por GPS.
          </p>
        </div>
      )}

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {unidades.map((u) => (
          <li key={u.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`truncate text-sm font-medium ${
                    u.active ? "text-slate-900" : "text-slate-400"
                  }`}
                >
                  {u.name}
                  {u.require_selfie && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">
                      exige selfie
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-500 tabular-nums">
                  {u.address ? `${u.address} · ` : ""}
                  raio de {u.radius_m} m
                  {u.lat != null && u.lng != null && (
                    <span className="text-slate-400">
                      {" · "}
                      {u.lat.toFixed(5)}, {u.lng.toFixed(5)}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditando(editando === u.id ? null : u.id);
                  setCriando(false);
                }}
                className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
              >
                {editando === u.id ? "Fechar" : "Editar"}
              </button>
            </div>

            {editando === u.id && (
              <div className="mt-3">
                <UnidadeForm unidade={u} aoTerminar={() => setEditando(null)} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UnidadeForm({
  unidade,
  aoTerminar,
}: {
  unidade?: Unidade;
  aoTerminar: () => void;
}) {
  const [state, action] = useActionState(salvarUnidade, ESTADO_VAZIO);
  // Formulário aberto depois de salvar convida a criar duplicata: os campos
  // controlados guardam o valor anterior enquanto os não-controlados zeram.
  useEffect(() => {
    if (state.ok) aoTerminar();
  }, [state.ok, aoTerminar]);

  const [exclusao, exclusaoAction] = useActionState(excluirUnidade, ESTADO_VAZIO);
  const [coords, setCoords] = useState<{ lat: string; lng: string }>({
    lat: unidade?.lat != null ? String(unidade.lat) : "",
    lng: unidade?.lng != null ? String(unidade.lng) : "",
  });
  const [buscando, setBuscando] = useState(false);
  const [erroGps, setErroGps] = useState<string | null>(null);

  /** Preencher pela posição atual é o caminho realista: o gestor está no local. */
  function usarMinhaPosicao() {
    setErroGps(null);
    if (!navigator.geolocation) {
      setErroGps("Este navegador não informa localização.");
      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
        setBuscando(false);
      },
      (err) => {
        setErroGps(
          err.code === err.PERMISSION_DENIED
            ? "Permissão de localização negada. Digite as coordenadas à mão."
            : "Não foi possível obter a localização agora.",
        );
        setBuscando(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        {unidade && <input type="hidden" name="id" value={unidade.id} />}

        <Campo label="Nome" className="sm:col-span-2">
          <input
            name="name"
            required
            defaultValue={unidade?.name}
            placeholder="Loja Centro"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Campo>

        <Campo label="Endereço (opcional)" className="sm:col-span-2">
          <input
            name="address"
            defaultValue={unidade?.address ?? ""}
            placeholder="Rua da Aurora, 100"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </Campo>

        <Campo label="Latitude">
          <input
            name="lat"
            required
            value={coords.lat}
            onChange={(e) => setCoords((c) => ({ ...c, lat: e.target.value }))}
            placeholder="-8.047562"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
          />
        </Campo>

        <Campo label="Longitude">
          <input
            name="lng"
            required
            value={coords.lng}
            onChange={(e) => setCoords((c) => ({ ...c, lng: e.target.value }))}
            placeholder="-34.877000"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
          />
        </Campo>

        <div className="sm:col-span-2">
          <button
            type="button"
            onClick={usarMinhaPosicao}
            disabled={buscando}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {buscando ? "Localizando…" : "Usar minha posição atual"}
          </button>
          {erroGps && <p className="mt-1 text-xs text-amber-700">{erroGps}</p>}
        </div>

        <Campo label="Raio aceito (metros)">
          <input
            type="number"
            name="radius_m"
            min={20}
            max={2000}
            step={10}
            defaultValue={unidade?.radius_m ?? 120}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
          />
          <span className="mt-1 block text-xs text-slate-400">
            Entre 20 e 2000 m. Abaixo disso o GPS do celular recusa gente que
            está no local.
          </span>
        </Campo>

        <Campo label="Selfie">
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              name="require_selfie"
              defaultChecked={unidade?.require_selfie}
              className="h-4 w-4"
            />
            <span className="text-slate-700">Exigir foto ao bater ponto</span>
          </label>
        </Campo>

        {state.erro && (
          <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.erro}
          </p>
        )}
        {exclusao.erro && (
          <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {exclusao.erro}
          </p>
        )}

        <div className="flex items-center gap-2 sm:col-span-2">
          <Salvar />
          <button
            type="button"
            onClick={aoTerminar}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800"
          >
            Fechar
          </button>
        </div>
      </form>

      {unidade && (
        <form action={exclusaoAction} className="mt-2 border-t border-slate-200 pt-2">
          <input type="hidden" name="id" value={unidade.id} />
          <button className="text-xs text-red-600 hover:underline">
            Excluir esta unidade
          </button>
        </form>
      )}
    </div>
  );
}

function Salvar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
    >
      {pending ? "Salvando…" : "Salvar"}
    </button>
  );
}

function Campo({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}
