import { createFileRoute } from "@tanstack/react-router";
import { FormularioOverlay, type PreenchePaciente } from "@/components/FormularioOverlay";
import { CAMPOS, CHECKS } from "@/lib/laudo-aih-layout";
import { montarTituloFicha } from "@/lib/bpa-i-v2/titulo-ficha";
import type { Paciente } from "@/lib/pacientes";
import laudoBg from "@/assets/laudo-aih.png";

export const Route = createFileRoute("/laudo-aih")({
  head: () => ({ meta: [{ title: "Laudo AIH — Solicitação de Internação Hospitalar" }] }),
  component: LaudoAihPage,
});

const soDig = (s: string | null | undefined) => (s || "").replace(/\D/g, "");
// "YYYY-MM-DD" -> "DD|MM|YYYY" (valor cru do campo de data). "" se inválido.
const dataParaCasinhas = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}|${m[2]}|${m[1]}` : "";
};
// Competência (AAAAMM) a partir de um campo de data ("DD|MM|AAAA"). "" se inválido.
const compDeData = (v?: string) => {
  const p = (v ?? "").split("|");
  return p.length === 3 && /^\d{2}$/.test(p[1]) && /^\d{4}$/.test(p[2]) ? `${p[2]}${p[1]}` : "";
};

// Campos do laudo AIH preenchidos a partir do paciente (usados p/ preencher e p/ limpar).
const CAMPOS_PACIENTE = [
  "pac_nome", "pac_apelido", "pac_cns", "pac_nascimento", "pac_mae", "pac_ddd", "pac_telefone",
  "endereco", "numero", "bairro", "mun_residencia", "ibge", "uf_residencia", "cep",
];

function preencherPaciente(p: Paciente, api: PreenchePaciente) {
  api.texto("pac_nome", (p.nome || "").toUpperCase());
  api.texto("pac_apelido", (p.nome_social || "").toUpperCase());
  api.texto("pac_cns", soDig(p.cns));
  const nasc = dataParaCasinhas(p.nascimento);
  if (nasc) api.bruto("pac_nascimento", nasc);
  api.texto("pac_mae", (p.nome_mae || "").toUpperCase());
  const tel = soDig(p.telefone);
  if (tel.length >= 10) { api.texto("pac_ddd", tel.slice(0, 2)); api.texto("pac_telefone", tel.slice(2)); }
  const endereco = [p.logradouro, p.complemento].map((s) => (s || "").trim()).filter(Boolean).join(" ");
  api.texto("endereco", endereco.toUpperCase());
  api.texto("numero", soDig(p.numero) || (p.numero || "").toUpperCase());
  api.texto("bairro", (p.bairro || "").toUpperCase());
  api.texto("mun_residencia", (p.municipio_nome || "").toUpperCase());
  api.texto("ibge", soDig(p.municipio_ibge).slice(0, 7));
  if ((p.uf || "").trim().length === 2) api.texto("uf_residencia", p.uf!.trim().toUpperCase());
  if (soDig(p.cep).length === 8) api.texto("cep", soDig(p.cep));
  if (p.sexo === "M") api.check("sexo_masculino", true);
  else if (p.sexo === "F") api.check("sexo_feminino", true);
}

function limparPaciente(api: PreenchePaciente) {
  CAMPOS_PACIENTE.forEach((k) => api.texto(k, ""));
  api.check("sexo_masculino", false);
  api.check("sexo_feminino", false);
}

function LaudoAihPage() {
  return (
    <FormularioOverlay
      titulo="Laudo AIH — Solicitação de Internação Hospitalar"
      storageKey="laudo-aih"
      campos={CAMPOS}
      checks={CHECKS}
      paginas={[{ bg: laudoBg, aspect: "1544 / 2204" }]}
      integracaoPaciente={{
        cnesCampo: "estab_solicitante_cnes",
        aoEscolher: preencherPaciente,
        aoLimpar: limparPaciente,
      }}
      nuvem={{
        tipo: "AIH",
        // Padrão das demais fichas: CNES · profissional · competência (da data de solicitação).
        meta: (txt) => ({
          tipo: "AIH",
          cnes: soDig(txt["estab_solicitante_cnes"]) || null,
          profissionalNome: (txt["prof_nome"] || "").trim() || null,
          profissionalCns: soDig(txt["prof_num_documento"]) || null,
        }),
        competencia: (txt) => compDeData(txt["data_solicitacao"]),
        titulo: (txt) =>
          montarTituloFicha({
            cnes: soDig(txt["estab_solicitante_cnes"]),
            profNome: txt["prof_nome"] || null,
            competencia: compDeData(txt["data_solicitacao"]) || null,
          }) || "Ficha AIH",
      }}
    />
  );
}
