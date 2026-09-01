import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { isManager } from "@/lib/types";

export const metadata = { title: "Ajuda · PontoEscala" };

type Item = { pergunta: string; resposta: React.ReactNode; gestao: boolean };

export default async function AjudaPage() {
  const { active } = await requireWorkspace();
  const gestor = isManager(active.role);

  const itens: Item[] = [
    {
      gestao: false,
      pergunta: "O aplicativo diz que estou fora do raio, mas estou no local",
      resposta: (
        <>
          O GPS do celular erra mais dentro de prédio e perto de parede. Vá até
          a porta ou para a calçada e tente de novo. Se continuar, peça a quem
          administra para registrar o ponto por você — a tela de{" "}
          <Link href="/bater-ponto" className="text-blue-600 underline underline-offset-2">
            bater ponto
          </Link>{" "}
          tem a opção &ldquo;Esqueci de bater uma batida&rdquo;.
        </>
      ),
    },
    {
      gestao: false,
      pergunta: "Estou sem internet na hora de bater",
      resposta: (
        <>
          Bata normalmente. A batida fica guardada no celular com o horário
          certo e sobe sozinha quando a conexão voltar — desde que o aplicativo
          continue aberto. O horário registrado é o da batida, não o da
          sincronização.
        </>
      ),
    },
    {
      gestao: false,
      pergunta: "Esqueci de bater a saída ontem",
      resposta: (
        <>
          Abra{" "}
          <Link href="/bater-ponto" className="text-blue-600 underline underline-offset-2">
            Bater ponto
          </Link>
          , toque em &ldquo;Esqueci de bater uma batida&rdquo; e diga o que
          aconteceu. Quem administra decide, e a correção fica registrada com o
          motivo. Você não registra ponto para trás sozinho, e isso é
          proposital.
        </>
      ),
    },
    {
      gestao: true,
      pergunta: "Por que um dia aparece como “em aberto” no relatório?",
      resposta: (
        <>
          Porque tem entrada e não tem saída. Enquanto estiver assim, as horas
          daquele dia não entram na conta — mostrar um número seria inventar.
          Corrija em{" "}
          <Link href="/ponto" className="text-blue-600 underline underline-offset-2">
            Ponto
          </Link>
          , incluindo a batida que faltou.
        </>
      ),
    },
    {
      gestao: true,
      pergunta: "O relatório diz “intervalo presumido”. O que é isso?",
      resposta: (
        <>
          A pessoa não bateu o intervalo, mas o turno prevê um. O sistema
          desconta o intervalo previsto assim mesmo — senão esquecer de bater o
          almoço viraria hora extra automática. O espelho de ponto marca esses
          dias para que o número possa ser explicado.
        </>
      ),
    },
    {
      gestao: true,
      pergunta: "Falta e ausência são a mesma coisa?",
      resposta: (
        <>
          Não. Falta é dia com escala e sem batida nenhuma. Ausência é falta
          justificada — atestado, férias, folga combinada ou feriado —
          registrada em{" "}
          <Link href="/ausencias" className="text-blue-600 underline underline-offset-2">
            Ausências
          </Link>
          . Dia de ausência não vira hora devida no saldo.
        </>
      ),
    },
    {
      gestao: true,
      pergunta: "Corrigir uma batida apaga o registro original?",
      resposta: (
        <>
          Nunca. A correção cria um registro novo apontando para o anterior, e
          o original continua no banco. É exigência de conformidade e é o que
          permite auditar depois quem mudou o quê e por quê.
        </>
      ),
    },
    {
      gestao: true,
      pergunta: "Como coloco a equipe toda de uma vez?",
      resposta: (
        <>
          Em{" "}
          <Link href="/equipe" className="text-blue-600 underline underline-offset-2">
            Equipe
          </Link>
          , use &ldquo;Convidar vários de uma vez&rdquo; e cole a lista — dá
          para copiar direto de uma planilha. Cada linha vira um convite, e as
          linhas com problema são reportadas uma a uma.
        </>
      ),
    },
    {
      gestao: true,
      pergunta: "Os dados são meus?",
      resposta: (
        <>
          São. Em Configurações → Dados você exporta tudo o que a empresa gerou
          num arquivo, e apaga a conta de vez quando quiser. A exclusão leva o
          histórico e os arquivos junto, e não há como desfazer.
        </>
      ),
    },
  ];

  const visiveis = itens.filter((i) => gestor || !i.gestao);

  return (
    <>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Ajuda
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          As dúvidas que aparecem na primeira semana de uso.
        </p>
      </header>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {visiveis.map((item) => (
          <details key={item.pergunta} className="group">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50">
              {item.pergunta}
            </summary>
            <div className="px-4 pb-4 text-sm text-slate-600">
              {item.resposta}
            </div>
          </details>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Fuso da empresa: {active.timezone}. Todos os horários do sistema são
        mostrados nele, mesmo para quem acessa de outro lugar.
      </p>
    </>
  );
}
