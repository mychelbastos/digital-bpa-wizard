import { useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Ripple, AnimatedForm, TechOrbitDisplay } from "@/components/blocks/modern-animated-sign-in";
import { signIn } from "@/lib/bpa-i-v2/auth";

// Ícones que orbitam no lado esquerdo (do componente original). Convertidos p/ <img>.
type OrbitIcon = {
  component: () => ReactNode;
  className: string;
  duration?: number;
  delay?: number;
  radius?: number;
  path?: boolean;
  reverse?: boolean;
};

const dev = (nome: string, arquivo: string) => () => (
  <img
    width={100}
    height={100}
    src={`https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/${arquivo}`}
    alt={nome}
  />
);

const iconsArray: OrbitIcon[] = [
  { component: dev("HTML5", "html5/html5-original.svg"), className: "size-[30px] border-none bg-transparent", duration: 20, delay: 20, radius: 100, path: false, reverse: false },
  { component: dev("CSS3", "css3/css3-original.svg"), className: "size-[30px] border-none bg-transparent", duration: 20, delay: 10, radius: 100, path: false, reverse: false },
  { component: dev("TypeScript", "typescript/typescript-original.svg"), className: "size-[50px] border-none bg-transparent", radius: 210, duration: 20, path: false, reverse: false },
  { component: dev("JavaScript", "javascript/javascript-original.svg"), className: "size-[50px] border-none bg-transparent", radius: 210, duration: 20, delay: 20, path: false, reverse: false },
  { component: dev("TailwindCSS", "tailwindcss/tailwindcss-original.svg"), className: "size-[30px] border-none bg-transparent", duration: 20, delay: 20, radius: 150, path: false, reverse: true },
  { component: dev("React", "react/react-original.svg"), className: "size-[50px] border-none bg-transparent", radius: 270, duration: 20, path: false, reverse: true },
  { component: dev("Supabase", "supabase/supabase-original.svg"), className: "size-[50px] border-none bg-transparent", radius: 270, duration: 20, delay: 60, path: false, reverse: true },
  { component: dev("Git", "git/git-original.svg"), className: "size-[50px] border-none bg-transparent", radius: 320, duration: 20, delay: 20, path: false, reverse: false },
];

// Tela de login (gate do app). Religada ao Supabase (e-mail+senha, sem signup).
// Ao logar com sucesso, o onAuthStateChange atualiza o guard, que troca p/ o conteúdo.
export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErro("");
    const r = await signIn(email.trim(), senha);
    setLoading(false);
    if (!r.ok) setErro(r.erro ?? "Falha no login.");
    // sucesso: o guard reage ao onAuthStateChange e mostra o app.
  };

  const formFields = {
    header: "Acesso restrito",
    subHeader: "Entre para acessar os formulários BPA",
    fields: [
      {
        label: "E-mail",
        required: true,
        type: "email" as const,
        placeholder: "seu@email.com",
        onChange: (e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value),
      },
      {
        label: "Senha",
        required: true,
        type: "password" as const,
        placeholder: "Sua senha",
        onChange: (e: ChangeEvent<HTMLInputElement>) => setSenha(e.target.value),
      },
    ],
    submitButton: loading ? "Entrando..." : "Entrar",
  };

  return (
    <section className="flex min-h-[100dvh] max-lg:justify-center">
      {/* Lado esquerdo: ripple + ícones orbitando */}
      <span className="relative flex w-1/2 flex-col justify-center overflow-hidden max-lg:hidden">
        <Ripple mainCircleSize={100} />
        <TechOrbitDisplay iconsArray={iconsArray} text="BPA Digital" />
      </span>

      {/* Lado direito: formulário */}
      <span className="flex h-[100dvh] w-1/2 flex-col items-center justify-center max-lg:w-full max-lg:px-[10%]">
        <AnimatedForm {...formFields} errorField={erro} onSubmit={handleSubmit} />
        <p className="mt-6 max-w-sm px-6 text-center text-xs text-muted-foreground">
          Contas são criadas pela administração. Sem acesso? Fale com o gestor da sua unidade.
        </p>
      </span>
    </section>
  );
}
