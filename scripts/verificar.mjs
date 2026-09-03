#!/usr/bin/env node
/**
 * Bateria de verificação de ponta a ponta contra o app rodando.
 *
 * Os testes pgTAP provam as regras no banco. Esta bateria prova o resto: que
 * a sessão funciona, que as guardas de rota valem, que as telas respondem
 * com o conteúdo certo e que as recusas chegam ao cliente com o status certo.
 *
 *   npm run dev          (noutro terminal)
 *   node scripts/verificar.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CONTAINER = "supabase_db_PontoFuncionario";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const API = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;

function sql(comando) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres",
     "-t", "-A", "-c", comando],
    { encoding: "utf8" },
  ).trim();
}

// ---------------------------------------------------------------
// Placar
// ---------------------------------------------------------------
let passou = 0;
const falhas = [];
let grupoAtual = "";

function grupo(nome) {
  grupoAtual = nome;
  console.log(`\n${nome}`);
}

function ok(descricao, condicao, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  ok   ${descricao}`);
  } else {
    falhas.push({ grupo: grupoAtual, descricao, detalhe });
    console.log(`  FALHA ${descricao}${detalhe ? ` — ${detalhe}` : ""}`);
  }
}

// ---------------------------------------------------------------
// Sessão: o mesmo caminho que o magic link do e-mail percorre.
// ---------------------------------------------------------------
async function sessaoDe(email) {
  const link = await fetch(`${API}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  }).then((r) => r.json());

  const r = await fetch(
    `${BASE}/auth/callback?token_hash=${link.hashed_token}&type=magiclink&proximo=%2F`,
    { redirect: "manual" },
  );

  const cookies = (r.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");

  if (!cookies) throw new Error(`sem cookie de sessão para ${email}`);
  return cookies;
}

function buscar(caminho, cookies, opcoes = {}) {
  return fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: { cookie: cookies, ...(opcoes.headers ?? {}) },
    redirect: "manual",
  });
}

async function texto(caminho, cookies) {
  const r = await buscar(caminho, cookies);
  return { status: r.status, corpo: await r.text() };
}

// ---------------------------------------------------------------
async function principal() {
  const companyId = sql(
    "select id from companies where name = 'Padaria Pão Quente'",
  );
  if (!companyId) {
    console.error("Rode antes: node scripts/seed-demo.mjs");
    process.exit(1);
  }

  const dono = await sessaoDe("iguin@padariademo.local");
  const gerente = await sessaoDe("marta@padariademo.local");
  const func = await sessaoDe("carla@padariademo.local");

  // =============================================================
  grupo("1. Sessão e porta de entrada");

  const raizDono = await buscar("/", dono);
  ok("dono cai no painel", raizDono.headers.get("location")?.includes("/painel"),
     raizDono.headers.get("location") ?? "");

  const raizFunc = await buscar("/", func);
  ok("funcionário cai na própria escala",
     raizFunc.headers.get("location")?.includes("/minha-escala"),
     raizFunc.headers.get("location") ?? "");

  const semSessao = await fetch(`${BASE}/painel`, { redirect: "manual" });
  ok("sem sessão, rota privada manda para o login",
     semSessao.headers.get("location")?.includes("/login"));

  // =============================================================
  grupo("2. Guardas por papel");

  for (const rota of ["/painel", "/equipe", "/escala", "/ponto", "/ausencias",
                      "/configuracoes/turnos"]) {
    const r = await buscar(rota, func);
    ok(`funcionário barrado em ${rota}`,
       r.status === 307 && r.headers.get("location")?.includes("/minha-escala"),
       `${r.status} ${r.headers.get("location") ?? ""}`);
  }

  for (const rota of ["/escala", "/ponto", "/ausencias", "/relatorios"]) {
    const r = await buscar(rota, gerente);
    ok(`gerente entra em ${rota}`, r.status === 200, String(r.status));
  }

  // /relatorios é aberto ao funcionário de propósito: period_report() já
  // devolve só a linha dele, e o histórico das próprias horas é dele.
  const relFunc = await texto("/relatorios", func);
  ok("funcionário entra no relatório", relFunc.status === 200, String(relFunc.status));
  ok("e vê só a própria linha",
     relFunc.corpo.includes("Carla Souza") &&
       !relFunc.corpo.includes("Bruno Lima") &&
       !relFunc.corpo.includes("Rita Nunes"));

  const empresaGerente = await buscar("/configuracoes/empresa", gerente);
  ok("gerente barrado na configuração da empresa",
     empresaGerente.status === 307, String(empresaGerente.status));

  const dadosGerente = await buscar("/configuracoes/dados", gerente);
  ok("gerente barrado nos dados da empresa",
     dadosGerente.status === 307, String(dadosGerente.status));

  // =============================================================
  grupo("3. Telas do gestor carregam com dados");

  const painel = await texto("/painel", dono);
  ok("painel abre", painel.status === 200);
  ok("painel mostra o nome da empresa", painel.corpo.includes("Padaria Pão Quente"));
  ok("painel lista as pendências", painel.corpo.includes("Precisa da sua atenção"));
  ok("painel aponta o pedido de correção",
     /pedido\(s\) de correção/.test(painel.corpo));

  const equipe = await texto("/equipe", dono);
  ok("equipe abre", equipe.status === 200);
  for (const nome of ["Carla Souza", "Bruno Lima", "Rita Nunes", "Diego Farias"]) {
    ok(`equipe mostra ${nome}`, equipe.corpo.includes(nome));
  }

  const escala = await texto("/escala", dono);
  ok("escala abre", escala.status === 200);
  ok("escala mostra turnos", /Manhã|Tarde|Noite/.test(escala.corpo));
  ok("escala mostra o resumo de horas", escala.corpo.includes("Horas previstas"));

  const mes = await texto("/escala/mes", dono);
  ok("visão mensal abre", mes.status === 200);

  const ponto = await texto("/ponto", dono);
  ok("tela de ponto abre", ponto.status === 200);
  ok("tela de ponto tem o pedido pendente",
     ponto.corpo.includes("esperando decisão"));

  const ausencias = await texto("/ausencias", dono);
  ok("ausências abre", ausencias.status === 200);
  ok("ausências mostra o atestado", ausencias.corpo.includes("Atestado"));
  ok("ausências mostra o feriado da empresa",
     ausencias.corpo.includes("Empresa toda"));

  // =============================================================
  grupo("4. Relatório e os números");

  const hoje = sql("select (now() at time zone 'America/Recife')::date::text");
  const de = sql(`select ('${hoje}'::date - 29)::text`);

  const rel = await texto(`/relatorios?de=${de}&ate=${hoje}`, dono);
  ok("relatório abre", rel.status === 200);
  ok("relatório traz a equipe", rel.corpo.includes("Carla Souza"));

  // O mesmo número, pelas duas portas: banco e CSV.
  const doBanco = sql(`
    select set_config('request.jwt.claims',
      json_build_object('sub', (select id from auth.users where email='iguin@padariademo.local'),
                        'role','authenticated')::text, false);
    set role authenticated;
    select trabalhado_min from period_report('${companyId}','${de}','${hoje}')
    where full_name = 'Carla Souza';
  `).split("\n").pop().trim();

  const csv = await buscar(`/api/relatorio.csv?de=${de}&ate=${hoje}`, dono);
  const csvTexto = await csv.text();
  ok("CSV baixa", csv.status === 200);
  ok("CSV tem cabeçalho em português", csvTexto.includes("Trabalhado (h:mm)"));

  const linhaCarla = csvTexto.split(/\r?\n/).find((l) => l.startsWith("Carla"));
  const trabalhadoCsv = linhaCarla?.split(";")[6] ?? "";
  const esperado = `${Math.floor(Number(doBanco) / 60)}:${String(Number(doBanco) % 60).padStart(2, "0")}`;
  ok("CSV e banco dizem o mesmo total", trabalhadoCsv === esperado,
     `csv=${trabalhadoCsv} banco=${esperado}`);

  const membroCarla = sql(
    `select id from memberships where company_id='${companyId}' and full_name='Carla Souza'`,
  );
  const espelho = await texto(`/espelho/${membroCarla}?de=${de}&ate=${hoje}`, dono);
  ok("espelho de ponto abre", espelho.status === 200);
  ok("espelho tem as assinaturas",
     espelho.corpo.includes("Assinatura do funcionário"));
  ok("espelho explica o intervalo presumido",
     espelho.corpo.includes("Presumido"));

  // =============================================================
  grupo("5. Funcionário: o que ele vê e o que não vê");

  const minha = await texto("/minha-escala", func);
  ok("minha escala abre", minha.status === 200);
  ok("mostra as horas previstas dela", minha.corpo.includes("Horas previstas"));
  for (const colega of ["Bruno Lima", "Rita Nunes", "Diego Farias"]) {
    ok(`não mostra a escala de ${colega}`, !minha.corpo.includes(colega));
  }

  const baterPonto = await texto("/bater-ponto", func);
  ok("bater ponto abre", baterPonto.status === 200);
  ok("mostra a unidade e o raio", /raio de \d+ m/.test(baterPonto.corpo));

  const ajuda = await texto("/ajuda", func);
  ok("ajuda abre para o funcionário", ajuda.status === 200);
  ok("ajuda esconde os itens de gestão",
     !ajuda.corpo.includes("Como coloco a equipe toda"));

  // =============================================================
  grupo("6. Bater ponto: o que o servidor aceita e recusa");

  // Uma pessoa dedicada ao teste, sem histórico: `punches` é append-only, e
  // limpar o dia de alguém para tornar o teste previsível é justamente o que
  // o sistema (com razão) não deixa fazer.
  // E-mail novo a cada execução: reaproveitar o anterior exigiria apagá-lo, e
  // o sistema (com razão) recusa remover quem já bateu ponto.
  const EMAIL_TESTE = `teste.ponto.${Date.now()}@padariademo.local`;
  await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL_TESTE, email_confirm: true }),
  }).catch(() => null);

  sql(`insert into memberships (company_id, user_id, full_name, role)
       select '${companyId}', id, 'Teste Ponto', 'funcionario'
       from auth.users where email='${EMAIL_TESTE}'`);

  const membroTeste = sql(
    `select m.id from memberships m join auth.users u on u.id = m.user_id
     where m.company_id='${companyId}' and u.email='${EMAIL_TESTE}'`,
  );
  const locCentro = sql(
    `select id from locations where company_id='${companyId}' and name='Loja Centro'`,
  );
  // Escala de hoje no Centro: sem ela, com duas unidades, o servidor não sabe
  // onde a pessoa trabalha — e recusa, corretamente.
  sql(`insert into schedule_entries (company_id, membership_id, work_date, shift_key, location_id)
       values ('${companyId}','${membroTeste}','${hoje}','manha','${locCentro}')`);

  const testePonto = await sessaoDe(EMAIL_TESTE);

  const bater = (corpo) =>
    buscar("/api/punch", testePonto, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });

  const CENTRO = { lat: -8.06293, lng: -34.8713 };

  const forjado = await bater({
    tipo: "entrada", ...CENTRO, accuracy: 12,
    verified: true, distance_m: 0, membership_id: "00000000-0000-0000-0000-000000000000",
  });
  const corpoForjado = await forjado.json();
  ok("entrada dentro do raio é aceita mesmo com payload forjado",
     forjado.status === 200, `${forjado.status} ${JSON.stringify(corpoForjado).slice(0, 90)}`);
  ok("e o servidor grava a distância que ELE calculou",
     typeof corpoForjado.distance_m === "number" && corpoForjado.distance_m > 0,
     `distance_m=${corpoForjado.distance_m}`);

  if (corpoForjado.punch_id) {
    const forjadoNoBanco = sql(`
      select verified||' '||coalesce(distance_m::text,'null')
      from punches where id = '${corpoForjado.punch_id}'`);
    ok("verified veio do servidor, não do payload",
       forjadoNoBanco.startsWith("t") && !forjadoNoBanco.endsWith(" 0"),
       forjadoNoBanco);
  } else {
    ok("verified veio do servidor, não do payload", false, "a batida nem foi aceita");
  }

  const duplicada = await bater({ tipo: "entrada", ...CENTRO, accuracy: 12 });
  ok("segunda entrada seguida é recusada", duplicada.status === 422,
     String(duplicada.status));

  const longe = await bater({ tipo: "saida", lat: -8.2, lng: -35.0, accuracy: 12 });
  const corpoLonge = await longe.json();
  ok("batida longe da unidade é recusada", longe.status === 422);
  ok("com a distância na mensagem", /\d+ m da unidade/.test(corpoLonge.erro ?? ""),
     corpoLonge.erro);

  const impreciso = await bater({ tipo: "saida", ...CENTRO, accuracy: 900 });
  ok("GPS impreciso é recusado", impreciso.status === 422);

  const futuro = await bater({
    tipo: "saida", ...CENTRO, accuracy: 12,
    punched_at: new Date(Date.now() + 3 * 3600e3).toISOString(),
  });
  ok("horário no futuro é recusado", futuro.status === 422);

  const semSessaoPunch = await fetch(`${BASE}/api/punch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo: "entrada", ...CENTRO, accuracy: 12 }),
    redirect: "manual",
  });
  ok("sem sessão, /api/punch recusa", semSessaoPunch.status === 401,
     String(semSessaoPunch.status));

  // =============================================================
  grupo("7. Isolamento entre empresas");

  // Uma segunda empresa, com o próprio dono, não pode enxergar nada daqui.
  const outroEmail = "intruso@padariademo.local";
  await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: outroEmail, email_confirm: true }),
  }).catch(() => null);

  sql(`delete from companies where name = 'Mercado do Intruso'`);
  const outroToken = await (async () => {
    const link = await fetch(`${API}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", email: outroEmail }),
    }).then((r) => r.json());
    const s = await fetch(`${API}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", token_hash: link.hashed_token }),
    }).then((r) => r.json());
    return s.access_token;
  })();

  await fetch(`${API}/rest/v1/rpc/create_company_with_owner`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${outroToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_name: "Mercado do Intruso", p_full_name: "Intruso", p_timezone: "America/Recife",
    }),
  });

  const tentar = async (rpc, corpo) => {
    const r = await fetch(`${API}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${outroToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    return { status: r.status, dados: await r.json().catch(() => null) };
  };

  const escalaAlheia = await tentar("resolved_schedule", {
    p_company_id: companyId, p_from: de, p_to: hoje,
  });
  ok("outra empresa não lê a escala daqui",
     Array.isArray(escalaAlheia.dados) && escalaAlheia.dados.length === 0,
     `${escalaAlheia.status} ${JSON.stringify(escalaAlheia.dados).slice(0, 60)}`);

  const relatorioAlheio = await tentar("period_report", {
    p_company_id: companyId, p_from: de, p_to: hoje,
  });
  ok("nem o relatório",
     Array.isArray(relatorioAlheio.dados) && relatorioAlheio.dados.length === 0);

  const membrosAlheios = await tentar("company_members", { p_company_id: companyId });
  ok("nem a lista de pessoas",
     Array.isArray(membrosAlheios.dados) && membrosAlheios.dados.length === 0);

  const exportAlheio = await tentar("export_company_data", { p_company_id: companyId });
  ok("nem consegue exportar a base alheia", exportAlheio.status >= 400,
     String(exportAlheio.status));

  const pontosAlheios = await fetch(
    `${API}/rest/v1/punches?select=id&limit=5`,
    { headers: { apikey: ANON, Authorization: `Bearer ${outroToken}` } },
  ).then((r) => r.json());
  ok("e a tabela de ponto responde vazia para ele",
     Array.isArray(pontosAlheios) && pontosAlheios.length === 0,
     JSON.stringify(pontosAlheios).slice(0, 60));

  // =============================================================
  grupo("8. LGPD");

  const exportacao = await buscar("/api/exportar", dono);
  ok("dono exporta", exportacao.status === 200);
  const dados = await exportacao.json().catch(() => null);
  // Contado no banco: o próprio teste acrescentou uma pessoa, e cravar o
  // número faria a verificação quebrar por motivo errado.
  const membrosNoBanco = Number(
    sql(`select count(*) from memberships where company_id='${companyId}'`),
  );
  ok("exportação traz a equipe inteira",
     (dados?.membros?.length ?? 0) === membrosNoBanco,
     `exportou=${dados?.membros?.length} banco=${membrosNoBanco}`);
  ok("exportação traz o ponto", (dados?.ponto?.length ?? 0) > 300,
     `ponto=${dados?.ponto?.length}`);
  const ausenciasNoBanco = Number(
    sql(`select count(*) from absences where company_id='${companyId}'`),
  );
  ok("exportação traz as ausências",
     (dados?.ausencias?.length ?? 0) === ausenciasNoBanco);

  const exportFunc = await buscar("/api/exportar", func);
  ok("funcionário não exporta", exportFunc.status === 403,
     String(exportFunc.status));

  // =============================================================
  console.log(
    `\n${passou} verificações passaram, ${falhas.length} falharam.`,
  );
  if (falhas.length > 0) {
    console.log("\nFalhas:");
    for (const f of falhas) {
      console.log(`  [${f.grupo}] ${f.descricao}${f.detalhe ? ` — ${f.detalhe}` : ""}`);
    }
    process.exit(1);
  }
}

principal().catch((e) => {
  console.error("\nA bateria não chegou ao fim:", e.message);
  process.exit(1);
});
