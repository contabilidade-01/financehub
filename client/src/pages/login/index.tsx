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
import { LoginUser } from "@shared/schema";
import { VersionDisplay } from "@/components/shared/VersionDisplay";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { useTranslation } from "@/contexts/LocalizationContext";

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

  const onSubmit = async (data: LoginUser) => {
    try {
      setIsLoading(true);
      console.log("API Request: POST /api/auth/login", data);
      
      const response = await apiRequest("/api/auth/login", {
        method: "POST",
        data: data
      });
      
      console.log("API Response:", response);
      
      toast({
        title: "Login realizado com sucesso",
        description: "Bem-vindo ao FinanceHub!",
      });
      
      // Redireciona e força recarregamento da página para atualizar o estado de autenticação
      window.location.href = "/";
    } catch (error: any) {
      console.error("Login error:", error);
      
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-pattern">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center mb-4">
            {isLogoChecking ? null : logoUrl ? (
              <div className="w-[230px] h-[60px] flex items-center justify-center">
                <img src={logoUrl} alt="Logo" className="object-contain w-[230px] h-[60px]" style={{ maxWidth: 230, maxHeight: 60, transition: 'opacity 0.2s' }} />
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-neon">
                  <i className="ri-line-chart-fill text-2xl text-white"></i>
                </div>
                <h1 className="text-3xl font-bold font-space mt-3">Finance<span className="text-secondary">Hub</span></h1>
              </>
            )}
          </div>
          <p className="text-gray-400 mt-2">{t('login.subtitle', 'Seu controle financeiro pessoal')}</p>
        </div>

        <Card className="glass-card neon-border">
          <CardHeader>
            <CardTitle>{t('login.title', 'Entrar')}</CardTitle>
            <CardDescription>
              {t('login.description', 'Digite suas credenciais para acessar sua conta')}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                      <FormLabel>{t('login.password_label', 'Senha')}</FormLabel>
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
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-gray-400">
              {t('login.no_account', 'Não tem uma conta?')}{" "}
              <Button variant="link" className="p-0" onClick={() => navigate("/register")}>
                {t('login.create_account_link', 'Criar conta')}
              </Button>
            </p>
          </CardFooter>
        </Card>
        
        {/* Version Display in Footer */}
        <div className="mt-6 text-center">
          <VersionDisplay />
        </div>
      </div>
    </div>
  );
}
