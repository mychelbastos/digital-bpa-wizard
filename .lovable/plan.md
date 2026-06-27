## Problema atual no BPA-I

A primeira versão do BPA-I foi feita "no olhômetro" — sem medir o PNG como fiz no BPA-C. Resultado: quase todos os campos caem fora dos quadros, e muitos foram desenhados como "caixinhas de dígito" quando na verdade o formulário só tem **3 tipos de campos**:

1. **Caixinhas OTP de dígito**: só CNES (7), CNS Profissional (15), CNS Paciente (15) e CEP (8).
2. **Caixas únicas de texto livre** (sem dividir em dígitos): CBO, MÊS/ANO, EQUIPE, FOLHA, Nº Profissional, Nome Estab, Nome Paciente, Endereço, Telefone, Email, Bairro, Nº, Complemento, Nacionalidade, Raça/Cor, Etnia, IBGE, Cód Logradouro, Data Nasc, DDD, Data Atend, Cód Proc, Qtde, CNPJ, Serviço, Class, CID, Caráter, Autorização — **todos sem ticks visíveis no PNG renderizado**.
3. **Checkboxes**: Sexo Masc / Sexo Fem.

## Plano de reconstrução

### 1. Medir o PNG (1653×2339) com scripts numpy
Já tenho as 47 linhas horizontais detectadas. Vou mapear cada par (topo, base) para cada faixa de campo:

```
Estabelecimento (Nome + CNES) ......... 244–294   (10.43–12.57%)
Prof. CNS + Nome Profissional ......... 405–465   (17.32–19.88%)
Prof. CBO + Mes/Ano + Equipe + Folha .. 501–557   (21.42–23.81%)
[Banner Sequência 1: 639–702]
[Banner Identificação Paciente: 715–764]
... e assim por diante para cada sequência ...
```

Para cada sequência (3 no total) faço a mesma medição vertical. Depois meço **uma vez** as colunas (lefts) usando os ticks verticais detectados pelo scan numpy.

### 2. Reescrever `src/lib/bpai-layout.ts`
- Remover quase todos os arrays `digitBoxes` — manter só **CNES, CNS Prof, CNS Pac, CEP**.
- Demais campos viram simplesmente `{ top, left, width, height }` para `TextField`.
- Coordenadas em % calculadas a partir das medições do PNG.

### 3. Simplificar `src/routes/bpa-i.tsx`
- Trocar quase todos os `<DigitBoxes>` por `<TextField>` (texto livre).
- Manter `DigitBoxes` só nos 4 campos citados.
- Estado vira mais simples: `string` em vez de `string[]` para quase tudo.

### 4. Iterar com screenshot
Depois de aplicar, te peço uma screenshot da Sequência 1 inteira pra ajustar os offsets verticais finos (provavelmente 1-2 ciclos como foi no BPA-C).

## Impacto

Reescrita razoavelmente grande de 2 arquivos, mas o resultado vai ficar igual ao BPA-C: caixas certas, texto onde tem que ter texto, dígito-a-dígito só onde realmente são caixinhas separadas no formulário oficial.

**Confirma esse approach?** Em particular: tudo bem ter campo de texto livre único pra CBO/MES-ANO/EQUIPE/FOLHA/DataNasc/Cód Proc etc — em vez de tentar dividir dígito-a-dígito — já que o PNG não mostra ticks separadores neles?