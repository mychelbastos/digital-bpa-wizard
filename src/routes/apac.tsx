import { createFileRoute } from "@tanstack/react-router";
import { FormularioOverlay, type PreenchePaciente } from "@/components/FormularioOverlay";
import { CAMPOS, CHECKS } from "@/lib/apac-layout";
import { nomeCurto } from "@/lib/bpa-i-v2/titulo-ficha";
import type { Paciente } from "@/lib/pacientes";
import apac1 from "@/assets/apac-1.png";
import apac2 from "@/assets/apac-2.png";

export const Route = createFileRoute("/apac")({
  head: () => ({ meta: [{ title: "APAC — Laudo de Solicitação / Autorização" }] }),
  component: ApacPage,
});

const soDig = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

// "YYYY-MM-DD" -> "DD|MM|YYYY" (valor cru do campo de data de 3 casinhas). "" se inválido.
function dataParaCasinhas(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}|${m[2]}|${m[1]}` : "";
}

// Campos do overlay que recebem dados do paciente (usados p/ preencher e p/ limpar o vínculo).
const CAMPOS_PACIENTE = [
  "pac_nome", "pac_cpf_cns", "pac_nascimento", "pac_raca", "pac_etnia", "pac_mae",
  "pac_responsavel", "pac_endereco", "pac_mun_residencia", "pac_ibge", "pac_uf", "pac_cep",
];

// Espalha o paciente escolhido pelos campos do laudo APAC.
function preencherPaciente(p: Paciente, api: PreenchePaciente) {
  api.texto("pac_nome", (p.nome || "").toUpperCase());

  // Documento: CNS (15, alinhado à esquerda) ou CPF (11, ancorado à direita, como o crivo).
  const cns = soDig(p.cns), cpf = soDig(p.cpf);
  if (cns.length === 15) api.celulas("pac_cpf_cns", cns);
  else if (cpf.length === 11) api.bruto("pac_cpf_cns", [...Array(4).fill(""), ...cpf.split("")].join("|"));

  const nasc = dataParaCasinhas(p.nascimento);
  if (nasc) api.bruto("pac_nascimento", nasc);

  api.texto("pac_raca", p.raca_cor || "");
  api.texto("pac_etnia", soDig(p.etnia));
  api.texto("pac_mae", (p.nome_mae || "").toUpperCase());
  api.texto("pac_responsavel", (p.nome_responsavel || "").toUpperCase());

  const endereco = [p.logradouro, p.numero, p.complemento, p.bairro].map((s) => (s || "").trim()).filter(Boolean).join(", ");
  api.texto("pac_endereco", endereco.toUpperCase());
  api.texto("pac_mun_residencia", (p.municipio_nome || "").toUpperCase());
  if (soDig(p.municipio_ibge).length >= 7) api.celulas("pac_ibge", soDig(p.municipio_ibge).slice(0, 7));
  if ((p.uf || "").trim().length === 2) api.celulas("pac_uf", p.uf!.trim().toUpperCase());
  if (soDig(p.cep).length === 8) api.celulas("pac_cep", soDig(p.cep));

  // Sexo -> checkboxes do laudo.
  if (p.sexo === "M") api.check("sexo_masc", true);
  else if (p.sexo === "F") api.check("sexo_fem", true);
}

function limparPaciente(api: PreenchePaciente) {
  CAMPOS_PACIENTE.forEach((k) => api.texto(k, ""));
  api.check("sexo_masc", false);
  api.check("sexo_fem", false);
}

// Dígitos "puros" de um campo de casinhas ("seg|seg|..." -> "1234567").
const digApac = (v?: string) => (v ?? "").split("|").join("").replace(/\D/g, "");
// Competência (AAAAMM) a partir de um campo de data do overlay ("DD|MM|AAAA"). "" se inválido.
const compDeData = (v?: string) => {
  const p = (v ?? "").split("|"); // [DD, MM, AAAA]
  return p.length === 3 && /^\d{2}$/.test(p[1]) && /^\d{4}$/.test(p[2]) ? `${p[2]}${p[1]}` : "";
};
const compLabel = (c: string) => (/^\d{6}$/.test(c) ? `${c.slice(4, 6)}/${c.slice(0, 4)}` : "");

function ApacPage() {
  return (
    <FormularioOverlay
      titulo="APAC — Laudo de Solicitação / Autorização"
      storageKey="apac"
      campos={CAMPOS}
      checks={CHECKS}
      paginas={[
        { bg: apac1, aspect: "1653 / 2339" },
        { bg: apac2, aspect: "1653 / 2339" },
      ]}
      integracaoPaciente={{
        cnesCampo: "estab_solic_cnes",
        aoEscolher: preencherPaciente,
        aoLimpar: limparPaciente,
      }}
      nuvem={{
        tipo: "APAC",
        // Padrão: CNES · profissional solicitante · competência · PACIENTE (1º+último). Sem folha.
        meta: (txt) => ({
          tipo: "APAC",
          cnes: digApac(txt["estab_solic_cnes"]) || null,
          profissionalNome: nomeCurto(txt["prof_solic_nome"]) || null,
          profissionalCns: digApac(txt["prof_solic_cns"]) || null,
        }),
        competencia: (txt) => compDeData(txt["data_solicitacao"]),
        titulo: (txt) => {
          const partes = [
            digApac(txt["estab_solic_cnes"]),
            nomeCurto(txt["prof_solic_nome"]),
            compLabel(compDeData(txt["data_solicitacao"])),
            nomeCurto(txt["pac_nome"]),
          ].filter(Boolean);
          return partes.join(" · ") || "Ficha APAC";
        },
      }}
    />
  );
}
