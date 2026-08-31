"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  enfileirar,
  pendentes,
  sincronizar,
  type BatidaPendente,
} from "@/lib/fila-ponto";
import { createClient } from "@/lib/supabase/client";
import { reduzirImagem } from "@/lib/imagem";

export type EstadoPonto = {
  membership_id: string;
  work_date: string;
  ultimo_tipo: string | null;
  ultimo_em: string | null;
  permitidos: string[];
  location_name: string | null;
  location_lat: number | null;
  location_lng: number | null;
  radius_m: number | null;
  require_selfie: boolean;
};

type Batida = {
  id: string;
  type: string;
  punched_at: string;
  distance_m: number | null;
  atrasado: boolean;
};

const ROTULO: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  intervalo_inicio: "Início do intervalo",
  intervalo_fim: "Volta do intervalo",
};

type Fase =
  | { nome: "parado" }
  | { nome: "localizando" }
  | { nome: "enviando" }
  | { nome: "ok"; texto: string }
  | { nome: "fila"; texto: string }
  | { nome: "erro"; texto: string };

/** Metros até a unidade, para dar retorno antes de a pessoa tentar. */
function distancia(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) *
      Math.cos(rad(lat2)) *
      Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export default function Relogio({
  estado,
  timezone,
  companyId,
  batidasDeHoje,
}: {
  estado: EstadoPonto;
  timezone: string;
  companyId: string;
  batidasDeHoje: Batida[];
}) {
  const router = useRouter();
  const [foto, setFoto] = useState<File | null>(null);
  const [fase, setFase] = useState<Fase>({ nome: "parado" });
  const [naFila, setNaFila] = useState(0);
  const [posicao, setPosicao] = useState<{
    dist: number;
    precisao: number;
  } | null>(null);
  const [agora, setAgora] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setAgora(
        new Intl.DateTimeFormat("pt-BR", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timezone]);

  const escoarFila = useCallback(async () => {
    if (pendentes().length === 0) return;
    const r = await sincronizar();
    setNaFila(pendentes().length);
    if (r.enviadas > 0) {
      setFase({
        nome: "ok",
        texto: `${r.enviadas} batida(s) da fila foram registradas.`,
      });
      router.refresh();
    }
    if (r.descartadas.length > 0) {
      setFase({
        nome: "erro",
        texto: `Uma batida em espera foi recusada: ${r.descartadas[0].motivo}`,
      });
    }
  }, [router]);

  useEffect(() => {
    setNaFila(pendentes().length);
    void escoarFila();
    window.addEventListener("online", escoarFila);
    return () => window.removeEventListener("online", escoarFila);
  }, [escoarFila]);

  /** Posição atual, com precisão. Rejeita em vez de lançar. */
  function localizar(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Este aparelho não informa localização."));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
    });
  }

  async function bater(tipo: string) {
    setFase({ nome: "localizando" });

    let pos: GeolocationPosition;
    try {
      pos = await localizar();
    } catch (e) {
      const err = e as GeolocationPositionError;
      setFase({
        nome: "erro",
        texto:
          err.code === 1
            ? "Permissão de localização negada. Libere o acesso nas configurações do navegador para bater ponto."
            : err.code === 3
              ? "Não conseguimos sua localização a tempo. Vá para um lugar mais aberto e tente de novo."
              : "Não foi possível obter sua localização agora.",
      });
      return;
    }

    if (estado.location_lat != null && estado.location_lng != null) {
      setPosicao({
        dist: distancia(
          estado.location_lat,
          estado.location_lng,
          pos.coords.latitude,
          pos.coords.longitude,
        ),
        precisao: pos.coords.accuracy,
      });
    }

    // A selfie sobe ANTES da batida porque o servidor recusa o registro sem
    // ela. Se a batida for recusada depois (fora do raio), sobra uma foto
    // órfã no bucket — preço pequeno perto de inverter a ordem e ter de
    // validar duas vezes.
    let selfiePath: string | undefined;
    if (estado.require_selfie) {
      if (!foto) {
        setFase({
          nome: "erro",
          texto: "Esta unidade exige foto. Toque em “Tirar foto” antes de bater o ponto.",
        });
        return;
      }
      try {
        setFase({ nome: "enviando" });
        const menor = await reduzirImagem(foto);
        const caminho = `${companyId}/${estado.membership_id}/${crypto.randomUUID()}.jpg`;
        const supabase = createClient();
        const { error } = await supabase.storage
          .from("selfies")
          .upload(caminho, menor, { contentType: "image/jpeg" });
        if (error) {
          setFase({ nome: "erro", texto: `Não foi possível enviar a foto: ${error.message}` });
          return;
        }
        selfiePath = caminho;
      } catch {
        setFase({
          nome: "erro",
          texto: "Não foi possível preparar a foto. Tente de novo.",
        });
        return;
      }
    }

    const carga = {
      tipo,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      punched_at: new Date().toISOString(),
      selfie_path: selfiePath,
    };

    setFase({ nome: "enviando" });

    try {
      const r = await fetch("/api/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(carga),
      });

      if (r.ok) {
        const corpo = await r.json();
        setFoto(null);
        setFase({
          nome: "ok",
          texto: `${ROTULO[tipo]} registrada${
            corpo.distance_m != null ? ` a ${corpo.distance_m} m da unidade` : ""
          }.`,
        });
        router.refresh();
        return;
      }

      const corpo = await r.json().catch(() => ({ erro: "Falha ao registrar" }));
      setFase({ nome: "erro", texto: corpo.erro });
    } catch {
      if (estado.require_selfie) {
        setFase({
          nome: "erro",
          texto:
            "Sem internet, e esta unidade exige foto. A foto não cabe na fila local — procure sinal ou peça o registro ao gestor.",
        });
        return;
      }
      // Sem rede: guarda com o horário real e sobe depois.
      const pendente: BatidaPendente = {
        id_local: crypto.randomUUID(),
        tipo,
        lat: carga.lat,
        lng: carga.lng,
        accuracy: carga.accuracy,
        punched_at: carga.punched_at,
      };
      enfileirar(pendente);
      setNaFila(pendentes().length);
      setFase({
        nome: "fila",
        texto: `Sem internet agora. A ${ROTULO[tipo].toLowerCase()} das ${new Intl.DateTimeFormat(
          "pt-BR",
          { timeZone: timezone, hour: "2-digit", minute: "2-digit" },
        ).format(new Date())} ficou guardada e sobe assim que a conexão voltar.`,
      });
    }
  }

  const ocupado = fase.nome === "localizando" || fase.nome === "enviando";
  const foraDoRaio =
    posicao && estado.radius_m != null && posicao.dist > estado.radius_m;

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Bater ponto
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {estado.location_name}
          {estado.radius_m != null && ` · raio de ${estado.radius_m} m`}
        </p>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="text-4xl font-semibold tabular-nums tracking-tight text-slate-900">
          {agora || "--:--:--"}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {estado.ultimo_tipo
            ? `Última batida: ${ROTULO[estado.ultimo_tipo]}`
            : "Nenhuma batida hoje"}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {estado.permitidos.map((tipo) => (
            <button
              key={tipo}
              type="button"
              disabled={ocupado}
              onClick={() => bater(tipo)}
              className="w-full rounded-xl bg-blue-600 px-4 py-4 text-base font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {ocupado
                ? fase.nome === "localizando"
                  ? "Localizando…"
                  : "Registrando…"
                : ROTULO[tipo]}
            </button>
          ))}
        </div>

        {estado.require_selfie && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
            <p className="text-xs font-medium text-slate-700">
              Esta unidade exige foto no registro
            </p>
            <label className="mt-2 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-600 hover:bg-slate-100">
              <input
                type="file"
                accept="image/*"
                capture="user"
                className="sr-only"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              />
              {foto ? `Foto pronta (${Math.round(foto.size / 1024)} KB)` : "Tirar foto"}
            </label>
            {foto && (
              <button
                type="button"
                onClick={() => setFoto(null)}
                className="mt-2 text-xs text-slate-500 underline-offset-2 hover:underline"
              >
                Tirar outra
              </button>
            )}
          </div>
        )}

        {posicao && (
          <p className="mt-4 text-xs text-slate-500">
            Você está a {Math.round(posicao.dist)} m da unidade · precisão do
            GPS ±{Math.round(posicao.precisao)} m
            {foraDoRaio && (
              <span className="mt-1 block font-medium text-amber-700">
                Fora do raio permitido.
              </span>
            )}
          </p>
        )}
      </div>

      {fase.nome === "ok" && <Faixa tom="ok">{fase.texto}</Faixa>}
      {fase.nome === "fila" && <Faixa tom="espera">{fase.texto}</Faixa>}
      {fase.nome === "erro" && <Faixa tom="erro">{fase.texto}</Faixa>}

      {naFila > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">
            {naFila} batida(s) esperando conexão.
          </p>
          <button
            type="button"
            onClick={escoarFila}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900"
          >
            Tentar agora
          </button>
        </div>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-medium text-slate-900">Hoje</h2>
        {batidasDeHoje.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nenhuma batida registrada hoje.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {batidasDeHoje.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="text-slate-700">{ROTULO[b.type]}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {new Intl.DateTimeFormat("pt-BR", {
                    timeZone: timezone,
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(b.punched_at))}
                  {b.distance_m != null && ` · ${b.distance_m} m`}
                  {b.atrasado && (
                    <span className="ml-1 text-amber-600">sincronizada</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Faixa({
  tom,
  children,
}: {
  tom: "ok" | "erro" | "espera";
  children: React.ReactNode;
}) {
  const cor =
    tom === "ok"
      ? "bg-emerald-50 text-emerald-900 border-emerald-200"
      : tom === "espera"
        ? "bg-amber-50 text-amber-900 border-amber-200"
        : "bg-red-50 text-red-900 border-red-200";
  return (
    <p className={`mt-3 rounded-xl border px-4 py-3 text-sm ${cor}`} role="status">
      {children}
    </p>
  );
}
