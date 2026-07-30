// Primitivos compartilhados do cadastro de paciente. Extraídos de src/routes/tfd.tsx SEM
// mudança de lógica, para que o TFD e o BPA-I usem o MESMO PacientePicker/PacienteForm.
// (O TFD continua importando `campo`/`label`/`ComboField`/`digitos`/etc. daqui.)
import { useState } from "react";

// Classes utilitárias de formulário (mesmas do TFD).
export const campo = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
export const label = "text-xs font-medium text-muted-foreground";

// Só dígitos. Normalização p/ busca acento-insensível local (combos).
export const digitos = (s: string) => (s || "").replace(/\D/g, "");
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// Unidades da Federação (código = sigla), para autocomplete de UF.
export const UFS: { code: string; label: string }[] = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"],
  ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"],
  ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
  ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"], ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"],
  ["SE", "Sergipe"], ["TO", "Tocantins"],
].map(([code, nome]) => ({ code, label: `${code} — ${nome}` }));

// Rótulos amigáveis dos campos obrigatórios do paciente (para a mensagem de validação).
export const ROTULO_CAMPO: Record<string, string> = {
  "documento (CNS/CPF)": "CNS ou CPF", nome: "Nome", sexo: "Sexo", nascimento: "Nascimento",
  nacionalidade: "Nacionalidade", raca_cor: "Raça/Cor", cep: "CEP", municipio_ibge: "Cód. IBGE",
  logradouro: "Logradouro", numero: "Número", bairro: "Bairro", uf: "UF", telefone: "Telefone",
};

// Endereço-modelo p/ o "usar o mesmo endereço" (ex.: copiar do paciente ao acompanhante).
export interface EnderecoPadrao {
  cep?: string | null; cod_logradouro?: string | null; logradouro?: string | null;
  numero?: string | null; complemento?: string | null; bairro?: string | null;
  municipio_nome?: string | null; municipio_ibge?: string | null; uf?: string | null;
}

// Campo de texto com sugestões a partir de uma lista (código+label). Sugere ao digitar
// `minChars`+ letras; ao escolher, chama onPick com a opção.
export function ComboField(props: {
  value: string; onText: (t: string) => void; onPick: (o: { code: string; label: string }) => void;
  opcoes: { code: string; label: string }[]; minChars?: number; placeholder?: string; className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const min = props.minChars ?? 3;
  const termo = props.value || "";
  const sugestoes = termo.length >= min
    ? props.opcoes.filter((o) => norm(o.label).includes(norm(termo))).slice(0, 8)
    : [];
  return (
    <div className="relative">
      <input value={termo} onChange={(e) => { props.onText(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder={props.placeholder} className={props.className ?? campo} />
      {aberto && sugestoes.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-popover shadow">
          {sugestoes.map((o) => (
            <button key={o.code} type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { props.onPick(o); setAberto(false); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
