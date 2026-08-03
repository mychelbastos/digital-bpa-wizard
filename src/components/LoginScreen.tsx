import { useState, type ChangeEvent, type FormEvent } from "react";
import { Ripple, AnimatedForm } from "@/components/blocks/modern-animated-sign-in";
import { signIn } from "@/lib/bpa-i-v2/auth";
import spaLogo from "@/assets/spa-logo-full.png";

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
    subHeader: "Entre para acessar o Sistema de Produção Ambulatorial",
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
      {/* Lado esquerdo: anéis (ripple) + logo centralizada */}
      <span className="relative flex w-1/2 flex-col items-center justify-center overflow-hidden max-lg:hidden">
        <Ripple mainCircleSize={120} />
        <img src={spaLogo} alt="SPA Digital" className="relative z-10 w-[26rem] max-w-[70%] drop-shadow-sm" />
      </span>

      {/* Lado direito: formulário */}
      <span className="flex h-[100dvh] w-1/2 flex-col items-center justify-center max-lg:w-full max-lg:px-[10%]">
        <img src={spaLogo} alt="SPA Digital" className="mb-2 w-52 max-w-[70%] lg:hidden" />
        <AnimatedForm {...formFields} errorField={erro} onSubmit={handleSubmit} />
        <p className="mt-6 max-w-sm px-6 text-center text-xs text-muted-foreground">
          Contas são criadas pela administração. Sem acesso? Fale com o gestor da sua unidade.
        </p>
      </span>
    </section>
  );
}
