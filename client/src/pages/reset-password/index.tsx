import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { VersionDisplay } from "@/components/shared/VersionDisplay";
import { useTranslation } from "@/contexts/LocalizationContext";
import { ArrowLeft } from "lucide-react";

type TokenInfo = {
  valid: boolean;
  cadastroPendente?: boolean;
  nome?: string;
  telefone?: string;
  email?: string;
};

function formatPhone(val: string) {
  const digits = val.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length < 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

const createResetSchema = (
  t: (key: string, fallback: string) => string,
  cadastroPendente: boolean
) => {
  const senha = z.object({
    nova_senha: z
      .string()
      .min(6, t("reset.validation.password_min", "A senha deve ter pelo menos 6 caracteres")),
    confirmar_senha: z.string().min(1, t("reset.validation.confirm_required", "Confirme a senha")),
  });
  const base = cadastroPendente
    ? senha.extend({
        nome: z.string().min(2, t("reset.validation.name_min", "Informe o nome completo")),
        telefone: z
          .string()
          .min(10, t("reset.validation.phone_min", "Informe um telefone válido"))
          .max(11, t("reset.validation.phone_max", "Telefone com no máximo 11 dígitos")),
        email: z
          .string()
          .email(t("reset.validation.email_invalid", "E-mail inválido"))
          .refine((e) => !e.toLowerCase().endsWith("@tel.local"), {
            message: t("reset.validation.email_real", "Informe um e-mail real"),
          }),
      })
    : senha;
  return base.refine((d) => d.nova_senha === d.confirmar_senha, {
    message: t("reset.validation.password_mismatch", "As senhas não coincidem"),
    path: ["confirmar_senha"],
  });
};

type ResetForm = {
  nome?: string;
  telefone?: string;
  email?: string;
  nova_senha: string;
  confirmar_senha: string;
};

function ResetFormCard({ token, info }: { token: string; info: TokenInfo }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const cadastroPendente = Boolean(info.cadastroPendente);

  const schema = useMemo(
    () => createResetSchema(t, cadastroPendente),
    [t, cadastroPendente]
  );

  const form = useForm<ResetForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: info.nome || "",
      telefone: (info.telefone || "").replace(/\D/g, "").slice(0, 11),
      email: info.email || "",
      nova_senha: "",
      confirmar_senha: "",
    },
  });

  const onSubmit = async (data: ResetForm) => {
    try {
      setIsLoading(true);
      const payload: Record<string, string> = {
        token,
        novaSenha: data.nova_senha,
      };
      if (cadastroPendente) {
        payload.nome = data.nome || "";
        payload.telefone = (data.telefone || "").replace(/\D/g, "");
        payload.email = (data.email || "").trim().toLowerCase();
      }
      const response = await apiRequest("/api/auth/reset-password", {
        method: "POST",
        data: payload,
      });
      toast({
        title: cadastroPendente
          ? t("reset.signup_success_title", "Cadastro concluído")
          : t("reset.success_title", "Senha criada"),
        description:
          response?.message ||
          t("reset.success_desc", "Tudo certo! Entrando no sistema…"),
      });
      if (response?.autenticado) {
        window.location.href = "/";
      } else {
        navigate("/");
      }
    } catch (error: any) {
      toast({
        title: cadastroPendente
          ? t("reset.signup_error_title", "Não foi possível concluir o cadastro")
          : t("reset.error_title", "Não foi possível redefinir"),
        description:
          error?.message ||
          t("reset.error_desc", "Link inválido ou expirado. Peça um novo."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-pattern">
      <div className="w-full max-w-md">
        <Card className="glass-card neon-border">
          <CardHeader>
            <CardTitle>
              {cadastroPendente
                ? t("reset.signup_title", "Concluir cadastro")
                : t("reset.title", "Nova senha")}
            </CardTitle>
            <CardDescription>
              {cadastroPendente
                ? t(
                    "reset.signup_description",
                    "Confirme seus dados e defina a senha de acesso. Nome e WhatsApp já vieram da conversa."
                  )
                : t("reset.description", "Escolha uma senha com pelo menos 6 caracteres.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {cadastroPendente && (
                  <>
                    <FormField
                      control={form.control}
                      name="nome"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("reset.name_label", "Nome completo")}</FormLabel>
                          <FormControl>
                            <Input autoComplete="name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="telefone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("reset.phone_label", "WhatsApp")}</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                                +55
                              </span>
                              <Input
                                className="pl-12"
                                inputMode="numeric"
                                autoComplete="tel"
                                value={formatPhone(field.value || "")}
                                onChange={(e) =>
                                  field.onChange(e.target.value.replace(/\D/g, "").slice(0, 11))
                                }
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("reset.email_label", "E-mail")}</FormLabel>
                          <FormControl>
                            <Input type="email" autoComplete="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
                <FormField
                  control={form.control}
                  name="nova_senha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {cadastroPendente
                          ? t("reset.signup_password_label", "Senha")
                          : t("reset.password_label", "Nova senha")}
                      </FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmar_senha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("reset.confirm_label", "Confirmar senha")}</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading
                    ? t("reset.saving", "Guardando...")
                    : cadastroPendente
                      ? t("reset.signup_submit", "Criar conta")
                      : t("reset.submit", "Guardar nova senha")}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button variant="link" className="gap-2" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4" />
              {t("reset.back_to_login", "Voltar ao login")}
            </Button>
          </CardFooter>
        </Card>
        <div className="mt-6 text-center">
          <VersionDisplay />
        </div>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  const [checking, setChecking] = useState(true);
  const [info, setInfo] = useState<TokenInfo>({ valid: false });
  const [, navigate] = useLocation();
  const search = useSearch();
  const { t } = useTranslation();

  const token = new URLSearchParams(search).get("token") || "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || token.length < 32) {
        if (!cancelled) {
          setInfo({ valid: false });
          setChecking(false);
        }
        return;
      }
      try {
        const data = await apiRequest(
          `/api/auth/reset-token?token=${encodeURIComponent(token)}`,
          { method: "GET" }
        );
        if (!cancelled) setInfo(data?.valid ? data : { valid: false });
      } catch {
        if (!cancelled) setInfo({ valid: false });
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-pattern">
        <p className="text-sm text-muted-foreground">
          {t("reset.checking", "Verificando link...")}
        </p>
      </div>
    );
  }

  if (!info.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-pattern">
        <div className="w-full max-w-md">
          <Card className="glass-card neon-border">
            <CardHeader>
              <CardTitle>{t("reset.invalid_title", "Link inválido ou expirado")}</CardTitle>
              <CardDescription>
                {t(
                  "reset.invalid_desc",
                  "Solicite uma nova recuperação de senha na tela de login."
                )}
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex justify-center">
              <Button variant="outline" className="gap-2" onClick={() => navigate("/forgot-password")}>
                <ArrowLeft className="h-4 w-4" />
                {t("reset.request_new", "Pedir novo link")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return <ResetFormCard token={token} info={info} />;
}
