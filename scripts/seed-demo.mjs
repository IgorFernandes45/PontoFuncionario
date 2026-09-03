#!/usr/bin/env node
/**
 * Popula uma operação de mentira, mas realista: uma padaria com equipe,
 * escala e um mês de ponto batido, incluindo os casos chatos — turno
 * noturno, atestado, falta, esquecimento de bater e correção.
 *
 * A configuração passa pelas RPCs de verdade (é fluxo, e queremos testar).
 * O histórico entra por SQL (é dado: register_punch recusa batida de mais de
 * 24h atrás, e com razão).
 *
 *   node scripts/seed-demo.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const API = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;

const CONTAINER = "supabase_db_PontoFuncionario";

function sql(comando) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres",
     "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", comando],
    { encoding: "utf8" },
  ).trim();
}

async function api(caminho, opcoes = {}, token = SRK) {
  const r = await fetch(`${API}${caminho}`, {
    ...opcoes,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opcoes.headers ?? {}),
    },
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${caminho} → ${r.status}: ${texto.slice(0, 200)}`);
  return texto ? JSON.parse(texto) : null;
}

async function criarUsuario(email) {
  await api("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, email_confirm: true }),
  }).catch(() => null); // já existe: segue
}

async function tokenDe(email) {
  const link = await api("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const sessao = await api(
    "/auth/v1/verify",
    {
      method: "POST",
      body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
    },
    ANON,
  );
  return sessao.access_token;
}

// ---------------------------------------------------------------
// Datas: um mês para trás a partir de hoje, no fuso da empresa.
// ---------------------------------------------------------------
const TZ = "America/Recife";
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

function somarDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
function diaSemana(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}
/** `2026-08-24` + `08:00` no fuso da empresa → instante UTC em ISO. */
function instante(dia, hhmm) {
  return `${dia} ${hhmm}:00-03`;
}

const EQUIPE = [
  { nome: "Iguin Barbosa", email: "iguin@padariademo.local", papel: "dono" },
  { nome: "Marta Alves", email: "marta@padariademo.local", papel: "gerente" },
  { nome: "Carla Souza", email: "carla@padariademo.local", papel: "funcionario" },
  { nome: "Bruno Lima", email: "bruno@padariademo.local", papel: "funcionario" },
  { nome: "Rita Nunes", email: "rita@padariademo.local", papel: "funcionario" },
  { nome: "Diego Farias", email: "diego@padariademo.local", papel: "funcionario" },
];

async function principal() {
  console.log("Limpando dados de demonstração anteriores…");
  sql("delete from companies where name = 'Padaria Pão Quente'");
  sql("delete from auth.users where email like '%@padariademo.local'");

  console.log("Criando contas…");
  for (const p of EQUIPE) await criarUsuario(p.email);

  console.log("Criando a empresa pelo caminho real (RPC)…");
  const tokenDono = await tokenDe(EQUIPE[0].email);
  const companyId = await api(
    "/rest/v1/rpc/create_company_with_owner",
    {
      method: "POST",
      body: JSON.stringify({
        p_name: "Padaria Pão Quente",
        p_full_name: EQUIPE[0].nome,
        p_timezone: TZ,
      }),
    },
    tokenDono,
  );

  console.log(`  empresa ${companyId}`);

  // Turnos: os três padrão já vieram do seed. Ajusta para uma padaria de
  // verdade e acrescenta um turno curto de fim de semana.
  sql(`update shift_templates set start_time='04:00', end_time='12:00', break_minutes=60
       where company_id='${companyId}' and key='manha'`);
  sql(`update shift_templates set start_time='12:00', end_time='20:00', break_minutes=60
       where company_id='${companyId}' and key='tarde'`);
  sql(`update shift_templates set start_time='20:00', end_time='04:00', break_minutes=60
       where company_id='${companyId}' and key='noite'`);
  sql(`insert into shift_templates (company_id, key, label, start_time, end_time, break_minutes, color)
       values ('${companyId}','sabado','Sábado curto','07:00','13:00',0,'#0d9488')`);

  // Duas unidades: obriga a escala a dizer onde cada um trabalha.
  sql(`insert into locations (company_id, name, address, lat, lng, radius_m)
       values ('${companyId}','Loja Centro','Rua da Aurora, 100',-8.063200,-34.871300,120)`);
  sql(`insert into locations (company_id, name, address, lat, lng, radius_m)
       values ('${companyId}','Loja Boa Viagem','Av. Boa Viagem, 2000',-8.128500,-34.901200,150)`);

  console.log("Montando a equipe…");
  for (const p of EQUIPE.slice(1)) {
    sql(`insert into memberships (company_id, user_id, full_name, role)
         select '${companyId}', id, '${p.nome}', '${p.papel}'
         from auth.users where email = '${p.email}'`);
  }

  const idDe = (nome) =>
    sql(`select id from memberships where company_id='${companyId}' and full_name='${nome}'`);
  const locCentro = sql(`select id from locations where company_id='${companyId}' and name='Loja Centro'`);
  const locBV = sql(`select id from locations where company_id='${companyId}' and name='Loja Boa Viagem'`);

  const membros = Object.fromEntries(EQUIPE.map((p) => [p.nome, idDe(p.nome)]));

  console.log("Montando a escala fixa…");
  // Carla: manhã (padeira), seg a sáb, no Centro.
  // Bruno: noite (vira o dia), seg a sex, no Centro.
  // Rita: tarde, ter a sáb, em Boa Viagem.
  // Diego: tarde, seg a sex, no Centro.
  const fixa = [
    ["Carla Souza", [1, 2, 3, 4, 5, 6], "manha", locCentro],
    ["Bruno Lima", [1, 2, 3, 4, 5], "noite", locCentro],
    ["Rita Nunes", [2, 3, 4, 5, 6], "tarde", locBV],
    ["Diego Farias", [1, 2, 3, 4, 5], "tarde", locCentro],
  ];
  for (const [nome, dias, turno, loc] of fixa) {
    for (const d of dias) {
      sql(`insert into schedule_entries (company_id, membership_id, weekday, shift_key, location_id)
           values ('${companyId}','${membros[nome]}',${d},'${turno}','${loc}')`);
    }
  }

  console.log("Gerando 30 dias de ponto…");
  const inicio = somarDias(hoje, -30);
  let batidas = 0;
  let faltas = 0;

  const TURNOS = {
    manha: { entrada: "04:00", saida: "12:00", intervalo: ["08:00", "09:00"] },
    tarde: { entrada: "12:00", saida: "20:00", intervalo: ["16:00", "17:00"] },
    noite: { entrada: "20:00", saida: "04:00", intervalo: ["00:00", "01:00"] },
    sabado: { entrada: "07:00", saida: "13:00", intervalo: null },
  };

  for (let i = 0; i < 30; i++) {
    const dia = somarDias(inicio, i);
    const dow = diaSemana(dia);

    for (const [nome, dias, turno, loc] of fixa) {
      if (!dias.includes(dow)) continue;

      const membro = membros[nome];
      const t = TURNOS[turno];

      // Uma falta a cada 17 dias por pessoa: gente falta.
      const semente = (i * 7 + nome.length) % 17;
      if (semente === 0) {
        faltas++;
        continue;
      }

      // Atraso ocasional de 8 a 25 minutos.
      const atraso = semente % 5 === 0 ? 8 + (semente % 18) : 0;
      const entrada = t.entrada.replace(
        /:(\d\d)/,
        (_, mm) => `:${String((Number(mm) + atraso) % 60).padStart(2, "0")}`,
      );
      const horaEntrada = atraso > 0 && Number(t.entrada.slice(3)) + atraso >= 60
        ? `${String(Number(t.entrada.slice(0, 2)) + 1).padStart(2, "0")}${entrada.slice(2)}`
        : entrada;

      const inserir = (tipo, hhmm, diaBase = dia) =>
        sql(`insert into punches (company_id, membership_id, location_id, type,
                punched_at, work_date, verified, distance_m, accuracy_m, verify_method)
             values ('${companyId}','${membro}','${loc}','${tipo}',
                     '${instante(diaBase, hhmm)}','${dia}', true,
                     ${10 + (semente % 40)}, ${8 + (semente % 12)}, 'gps')`);

      // O turno da noite fecha no dia seguinte, mas pertence a ESTE work_date.
      const viraDia = turno === "noite";

      inserir("entrada", horaEntrada);
      batidas++;

      // Uma vez a cada 11 dias a pessoa esquece de fechar o turno.
      const esqueceu = (i * 3 + nome.length) % 11 === 0;

      if (t.intervalo) {
        inserir("intervalo_inicio", t.intervalo[0], viraDia ? somarDias(dia, 1) : dia);
        inserir("intervalo_fim", t.intervalo[1], viraDia ? somarDias(dia, 1) : dia);
        batidas += 2;
      }

      if (!esqueceu) {
        inserir("saida", t.saida, viraDia ? somarDias(dia, 1) : dia);
        batidas++;
      }
    }
  }

  console.log("Registrando ausências…");
  // Atestado de 3 dias da Rita, férias do Diego e um feriado.
  const d1 = somarDias(hoje, -12);
  sql(`insert into absences (company_id, membership_id, kind, starts_on, ends_on, note)
       values ('${companyId}','${membros["Rita Nunes"]}','atestado','${d1}','${somarDias(d1, 2)}','Atestado de 3 dias')`);
  const d2 = somarDias(hoje, -8);
  sql(`insert into absences (company_id, membership_id, kind, starts_on, ends_on, note)
       values ('${companyId}','${membros["Diego Farias"]}','ferias','${d2}','${somarDias(d2, 4)}','Férias')`);
  sql(`insert into absences (company_id, kind, starts_on, ends_on, note)
       values ('${companyId}','feriado','${somarDias(hoje, -5)}','${somarDias(hoje, -5)}','Feriado municipal')`);

  console.log("Deixando pendências para o gestor resolver…");
  // Um pedido de correção do funcionário, esperando decisão.
  sql(`insert into punch_requests (company_id, membership_id, kind, requested_type, requested_at, reason)
       values ('${companyId}','${membros["Carla Souza"]}','inclusao','saida',
               '${instante(somarDias(hoje, -2), "12:00")}','Esqueci de bater a saída, o celular descarregou')`);

  const resumo = {
    empresa: companyId,
    pessoas: EQUIPE.length,
    turnos: Number(sql(`select count(*) from shift_templates where company_id='${companyId}'`)),
    unidades: Number(sql(`select count(*) from locations where company_id='${companyId}'`)),
    escala_fixa: Number(sql(`select count(*) from schedule_entries where company_id='${companyId}'`)),
    batidas: Number(sql(`select count(*) from punches where company_id='${companyId}'`)),
    ausencias: Number(sql(`select count(*) from absences where company_id='${companyId}'`)),
    faltas_simuladas: faltas,
    pedidos_pendentes: Number(sql(`select count(*) from punch_requests where company_id='${companyId}'`)),
  };

  console.log("\nPronto:");
  for (const [k, v] of Object.entries(resumo)) console.log(`  ${k}: ${v}`);
  console.log("\nEntre como iguin@padariademo.local (dono) ou carla@padariademo.local (funcionária).");
}

principal().catch((e) => {
  console.error("\nFalhou:", e.message);
  process.exit(1);
});
