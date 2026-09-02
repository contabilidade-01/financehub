import { useEffect, useState } from "react";
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

const createResetSchema = (t: (key: string, fallback: string) => string) =>
  z
    .object({
      nova_senha: z
        .string()
        .min(6, t("reset.validation.password_min", "A senha deve ter pelo menos 6 caracteres")),
      confirmar_senha: z.string().min(1, t("reset.validation.confirm_required", "Confirme a senha")),
    })
    .refine((d) => d.nova_senha === d.confirmar_senha, {
      message: t("reset.validation.password_mismatch", "As senhas não coincidem"),
      path: ["confirmar_senha"],
    });

type ResetForm = z.infer<ReturnType<typeof createResetSchema>>;

export default function ResetPassword() {
  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const { t } = useTranslation();

  const token = new URLSearchParams(search).get("token") || "";

  const form = useForm<ResetForm>({
    resolver: zodResolver(createResetSchema(t)),
    defaultValues: { nova_senha: "", confirmar_senha: "" },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || token.length < 32) {
        if (!cancelled) {
          setTokenValid(false);
          setChecking(false);
        }
        return;
      }
      try {
        const data = await apiRequest(
          `/api/auth/reset-token?token=${encodeURIComponent(token)}`,
          { method: "GET" }
        );
        if (!cancelled) setTokenValid(Boolean(data?.valid));
      } catch {
        if (!cancelled) setTokenValid(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (data: ResetForm) => {
    try {
      setIsLoading(true);
      const response = await apiRequest("/api/auth/reset-password", {
        method: "POST",
        data: { token, novaSenha: data.nova_senha },
      });
      toast({
        title: t("reset.success_title", "Senha criada"),
        description:
          response?.message ||
          t("reset.success_desc", "Tudo certo! Entrando no sistema…"),
      });
      // Auto-login: o backend já abriu a sessão. Recarrega em "/" para o app
      // reconhecer a sessão e cair direto no painel (em vez da tela de login).
      if (response?.autenticado) {
        window.location.href = "/";
      } else {
        navigate("/");
      }
    } catch (error: any) {
      toast({
        title: t("reset.error_title", "Não foi possível redefinir"),
        description:
          error?.message ||
          t("reset.error_desc", "Link inválido ou expirado. Peça um novo."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-pattern">
        <p className="text-sm text-muted-foreground">
          {t("reset.checking", "Verificando link...")}
        </p>
      </div>
    );
  }

  if (!tokenValid) {
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-pattern">
      <div className="w-full max-w-md">
        <Card className="glass-card neon-border">
          <CardHeader>
            <CardTitle>{t("reset.title", "Nova senha")}</CardTitle>
            <CardDescription>
              {t("reset.description", "Escolha uma senha com pelo menos 6 caracteres.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nova_senha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("reset.password_label", "Nova senha")}</FormLabel>
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
