import React, { useState } from "react";
import { LineChart } from "lucide-react";
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
import { LoginUser } from "@shared/schema";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { useTranslation } from "@/contexts/LocalizationContext";
import { useSystemConfig } from "@/contexts/SystemConfigContext";

const createLoginSchema = (t: (key: string, fallback: string) => string) => z.object({
  email: z.string().email(t('login.validation.email_invalid', 'Email inválido')),
  senha: z.string().min(6, t('login.validation.password_min', 'A senha deve ter pelo menos 6 caracteres')),
});

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { config: systemConfig } = useSystemConfig();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLogoChecking, setIsLogoChecking] = useState(false);
  const [logoChecked, setLogoChecked] = useState(false);

  useEffect(() => {
    if (!theme) return;
    setIsLogoChecking(true);
    setLogoChecked(false);
    const url = `/api/logo?theme=${theme}`;
    fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then(res => {
        if (res.ok) {
          // Preload imagem
          const img = new window.Image();
          img.onload = () => {
            setLogoUrl(url);
            setIsLogoChecking(false);
            setLogoChecked(true);
          };
          img.onerror = () => {
            setLogoUrl(null);
            setIsLogoChecking(false);
            setLogoChecked(true);
          };
          img.src = url;
        } else {
          setLogoUrl(null);
          setIsLogoChecking(false);
          setLogoChecked(true);
        }
      })
      .catch(() => {
        setLogoUrl(null);
        setIsLogoChecking(false);
        setLogoChecked(true);
      });
  }, [theme]);

  const form = useForm<LoginUser>({
    resolver: zodResolver(createLoginSchema(t)),
    defaultValues: {
      email: "",
      senha: "",
    },
  });

  // Segunda etapa (contas com verificação em duas etapas)
  const [etapa2fa, setEtapa2fa] = useState(false);
  const [codigo2fa, setCodigo2fa] = useState("");
  const [lembrar2fa, setLembrar2fa] = useState(true);

  const entrar = () => {
    toast({
      title: "Login realizado com sucesso",
      description: `Bem-vindo ao ${systemConfig.system_name}!`,
    });
    // Redireciona e força recarregamento da página para atualizar o estado de autenticação
    // Veio do link "assine por aqui" (WhatsApp): volta direto para a assinatura.
    window.location.href = window.location.pathname.startsWith("/subscription/renew") ? "/subscription/renew" : "/";
  };

  const onSubmit = async (data: LoginUser) => {
    try {
      setIsLoading(true);
      const response = await apiRequest<{ requires2fa?: boolean }>("/api/auth/login", {
        method: "POST",
        data: data
      });
      if (response?.requires2fa) {
        setCodigo2fa("");
        setEtapa2fa(true);
        return;
      }
      entrar();
    } catch (error: any) {
      console.error("Login error:", error?.message);
      
      let errorMessage = "Email ou senha incorretos.";
      let errorTitle = "Erro no login";
      
      // Check if it's a subscription expiration error
      if (error?.subscriptionExpired || error?.message?.includes("assinatura expirou")) {
        // Redirect to subscription expired page instead of showing toast
        navigate("/subscription-expired");
        return;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      const r = await apiRequest<{ via?: string; codigos_restantes?: number }>("/api/auth/2fa/verificar", {
        method: "POST",
        data: { codigo: codigo2fa, lembrar: lembrar2fa },
      });
      if (r?.via === "recuperacao") {
        toast({
          title: "Código de recuperação usado",
          description: `Restam ${r.codigos_restantes ?? 0}. Gere novos em Configurações > Segurança.`,
        });
      }
      entrar();
    } catch (error: any) {
      const msg = error?.message || "Código inválido.";
      toast({ title: "Não foi possível entrar", description: msg, variant: "destructive" });
      if (/de novo/.test(msg)) setEtapa2fa(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mb-4">
            <div className="flex flex-col items-center gap-3">
              {isLogoChecking ? null : logoUrl ? (
                <img src={logoUrl} alt="" className="h-16 w-16 object-contain" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center">
                  <LineChart className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
                </div>
              )}
              <h1 className="text-3xl font-bold">{systemConfig.system_name}</h1>
            </div>
          </div>
          <p className="text-muted-foreground mt-2">{t('login.subtitle', 'Seu controle financeiro pessoal')}</p>
        </div>

        <Card className="border bg-card">
          <CardHeader>
            <CardTitle>{t('login.title', 'Entrar')}</CardTitle>
            <CardDescription>
              {t('login.description', 'Digite suas credenciais para acessar sua conta')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {etapa2fa ? (
              <form onSubmit={onSubmit2fa} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Digite o código de 6 dígitos do seu aplicativo autenticador. Sem o celular, use um dos códigos de recuperação.
                </p>
                <Input
                  autoFocus
                  inputMode="text"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={codigo2fa}
                  onChange={(e) => setCodigo2fa(e.target.value)}
                  maxLength={12}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={lembrar2fa} onChange={(e) => setLembrar2fa(e.target.checked)} />
                  Lembrar este navegador por 30 dias
                </label>
                <Button type="submit" className="w-full" disabled={isLoading || codigo2fa.trim().length < 6}>
                  {isLoading ? t('login.logging_in', 'Entrando...') : "Confirmar"}
                </Button>
                <Button type="button" variant="link" className="w-full" onClick={() => setEtapa2fa(false)}>
                  Voltar
                </Button>
              </form>
            ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('login.email_label', 'Email')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('login.email_placeholder', 'email@exemplo.com')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="senha"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>{t('login.password_label', 'Senha')}</FormLabel>
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 text-xs"
                          onClick={() => navigate("/forgot-password")}
                        >
                          {t('login.forgot_password', 'Esqueci minha senha')}
                        </Button>
                      </div>
                      <FormControl>
                        <Input type="password" placeholder={t('login.password_placeholder', '******')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t('login.logging_in', 'Entrando...') : t('login.submit', 'Entrar')}
                </Button>
              </form>
            </Form>
            )}
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              {t('login.no_account', 'Não tem uma conta?')}{" "}
              <Button variant="link" className="p-0" onClick={() => navigate("/register")}>
                {t('login.create_account_link', 'Criar conta')}
              </Button>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
