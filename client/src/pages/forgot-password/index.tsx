import { useState } from "react";
import { useLocation } from "wouter";
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
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { useTranslation } from "@/contexts/LocalizationContext";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { ArrowLeft } from "lucide-react";

const createForgotSchema = (t: (key: string, fallback: string) => string) =>
  z.object({
    email: z.string().email(t("forgot.validation.email_invalid", "E-mail inválido")),
  });

type ForgotForm = z.infer<ReturnType<typeof createForgotSchema>>;

export default function ForgotPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { config: systemConfig } = useSystemConfig();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!theme) return;
    const url = `/api/logo?theme=${theme}`;
    fetch(url, { method: "HEAD", cache: "no-store" })
      .then((res) => {
        if (res.ok) setLogoUrl(url);
        else setLogoUrl(null);
      })
      .catch(() => setLogoUrl(null));
  }, [theme]);

  const form = useForm<ForgotForm>({
    resolver: zodResolver(createForgotSchema(t)),
    defaultValues: { email: "" },
  });

  const onSubmit = async (data: ForgotForm) => {
    try {
      setIsLoading(true);
      const response = await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        data: { email: data.email.trim().toLowerCase() },
      });
      setSent(true);
      toast({
        title: t("forgot.success_title", "Pedido enviado"),
        description:
          response?.message ||
          t(
            "forgot.success_desc",
            "Se o e-mail estiver cadastrado, você receberá um link em instantes."
          ),
      });
    } catch (error: any) {
      toast({
        title: t("forgot.error_title", "Não foi possível enviar"),
        description:
          error?.message ||
          t("forgot.error_desc", "Tente novamente mais tarde ou contate o suporte."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-pattern">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mb-4">
            <div className="flex flex-col items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-16 w-16 object-contain" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-neon">
                  <i className="ri-line-chart-fill text-2xl text-white"></i>
                </div>
              )}
              <h1 className="text-3xl font-bold font-space">
                {systemConfig?.system_name || "Khesef"}
              </h1>
            </div>
          </div>
        </div>

        <Card className="glass-card neon-border">
          <CardHeader>
            <CardTitle>{t("forgot.title", "Recuperar senha")}</CardTitle>
            <CardDescription>
              {t(
                "forgot.description",
                "Informe o e-mail da sua conta. Se estiver cadastrado, enviaremos um link para redefinir a senha."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>
                  {t(
                    "forgot.sent_message",
                    "Se os dados estiverem corretos, verifique sua caixa de entrada (e o spam). O link expira em cerca de 1 hora."
                  )}
                </p>
                <Button type="button" variant="outline" className="w-full" onClick={() => setSent(false)}>
                  {t("forgot.send_again", "Enviar novamente")}
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("forgot.email_label", "E-mail")}</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder={t("forgot.email_placeholder", "seu@email.com")}
                            autoComplete="email"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading
                      ? t("forgot.sending", "Enviando...")
                      : t("forgot.submit", "Enviar link")}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button variant="link" className="gap-2" onClick={() => navigate("/")}>
              <ArrowLeft className="h-4 w-4" />
              {t("forgot.back_to_login", "Voltar ao login")}
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
