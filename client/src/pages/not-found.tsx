import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Home, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/contexts/LocalizationContext';

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Detect theme
  useEffect(() => {
    const detectTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    };

    detectTheme();

    // Watch for theme changes
    const observer = new MutationObserver(detectTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  const logoSrc = theme === 'dark' ? '/logo-dark.png' : '/logo-light.png';

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-background">
      {/* Oscilloscope Wave Background */}
      <div className="absolute inset-0 opacity-30">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="wave-gradient-1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.6 }} />
              <stop offset="50%" style={{ stopColor: 'hsl(var(--secondary))', stopOpacity: 0.8 }} />
              <stop offset="100%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.6 }} />
            </linearGradient>
            <linearGradient id="wave-gradient-2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'hsl(var(--secondary))', stopOpacity: 0.4 }} />
              <stop offset="50%" style={{ stopColor: 'hsl(var(--chart-3))', stopOpacity: 0.6 }} />
              <stop offset="100%" style={{ stopColor: 'hsl(var(--secondary))', stopOpacity: 0.4 }} />
            </linearGradient>
            <linearGradient id="wave-gradient-3" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: 'hsl(var(--chart-5))', stopOpacity: 0.3 }} />
              <stop offset="50%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.5 }} />
              <stop offset="100%" style={{ stopColor: 'hsl(var(--chart-5))', stopOpacity: 0.3 }} />
            </linearGradient>
          </defs>

          {/* Animated Oscilloscope Waves */}
          <motion.path
            d="M0,200 Q250,100 500,200 T1000,200 T1500,200 T2000,200"
            stroke="url(#wave-gradient-1)"
            strokeWidth="3"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: 1,
              opacity: 1,
              x: [0, -500],
              transition: {
                pathLength: { duration: 2, ease: "easeInOut" },
                opacity: { duration: 1 },
                x: { duration: 8, repeat: Infinity, ease: "linear" }
              }
            }}
          />

          <motion.path
            d="M0,300 Q200,250 400,300 T800,300 T1200,300 T1600,300 T2000,300"
            stroke="url(#wave-gradient-2)"
            strokeWidth="2.5"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: 1,
              opacity: 1,
              x: [0, -400],
              transition: {
                pathLength: { duration: 2.2, ease: "easeInOut" },
                opacity: { duration: 1.2 },
                x: { duration: 10, repeat: Infinity, ease: "linear" }
              }
            }}
          />

          <motion.path
            d="M0,400 Q300,350 600,400 T1200,400 T1800,400 T2400,400"
            stroke="url(#wave-gradient-3)"
            strokeWidth="2"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: 1,
              opacity: 1,
              x: [0, -600],
              transition: {
                pathLength: { duration: 2.5, ease: "easeInOut" },
                opacity: { duration: 1.5 },
                x: { duration: 12, repeat: Infinity, ease: "linear" }
              }
            }}
          />

          {/* Additional waves for more depth */}
          <motion.path
            d="M0,500 Q350,480 700,500 T1400,500 T2100,500"
            stroke="url(#wave-gradient-1)"
            strokeWidth="1.5"
            fill="none"
            opacity="0.4"
            animate={{
              x: [-100, -700],
              transition: {
                duration: 15,
                repeat: Infinity,
                ease: "linear"
              }
            }}
          />
        </svg>
      </div>

      {/* Radial Gradient Glow */}
      <div className="absolute inset-0 bg-gradient-radial from-primary/10 via-transparent to-transparent pointer-events-none" />

      {/* Content Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center justify-center px-4 text-center"
      >
        {/* Logo with Lighting Effects */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: 0.2
          }}
          className="relative mb-8"
        >
          {/* Animated Glow Rings */}
          <motion.div
            className="absolute inset-0 -m-8"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.5, 0.2, 0.5],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <div className="w-full h-full rounded-full bg-gradient-to-r from-primary/40 to-secondary/40 blur-3xl" />
          </motion.div>

          <motion.div
            className="absolute inset-0 -m-4"
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.7, 0.3, 0.7],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5
            }}
          >
            <div className="w-full h-full rounded-full bg-gradient-to-r from-secondary/50 to-primary/50 blur-2xl" />
          </motion.div>

          {/* Logo Image */}
          <motion.img
            src={logoSrc}
            alt="FinanceHub Logo"
            className="relative w-32 h-32 md:w-40 md:h-40 object-contain drop-shadow-2xl"
            animate={{
              filter: [
                'drop-shadow(0 0 20px hsl(var(--primary)))',
                'drop-shadow(0 0 40px hsl(var(--secondary)))',
                'drop-shadow(0 0 20px hsl(var(--primary)))',
              ]
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />

          {/* Electric Spark Effect */}
          <motion.div
            className="absolute -top-2 -right-2"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [1, 0, 1],
              rotate: [0, 180, 360]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <Zap className="w-6 h-6 text-primary fill-primary" />
          </motion.div>
        </motion.div>

        {/* 404 Text with Neon Effect */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mb-6"
        >
          <h1
            className="text-8xl md:text-9xl font-bold font-space tracking-tighter"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 0 30px hsl(var(--primary) / 0.5))'
            }}
          >
            404
          </h1>
        </motion.div>

        {/* Subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="mb-4"
        >
          <h2 className="text-2xl md:text-3xl font-semibold font-space text-foreground mb-2">
            {t('common.not_found_title', 'Página Não Encontrada')}
          </h2>
          <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto">
            {t('common.not_found_description', 'A página que você está procurando não existe ou foi movida.')}
          </p>
        </motion.div>

        {/* Scan Line Effect */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, transparent 0%, hsl(var(--primary) / 0.1) 50%, transparent 100%)',
            height: '4px'
          }}
          animate={{
            y: [0, 600, 0]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "linear"
          }}
        />

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <Button
            onClick={() => setLocation('/')}
            size="lg"
            className="group relative overflow-hidden bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-primary-foreground font-semibold shadow-lg hover:shadow-2xl transition-all duration-300"
          >
            {/* Button Glow Effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-primary to-secondary opacity-0 group-hover:opacity-100 blur-xl"
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />

            <span className="relative flex items-center gap-2">
              <Home className="w-5 h-5" />
              {t('common.go_home', 'Voltar ao Início')}
            </span>
          </Button>
        </motion.div>

        {/* Floating Particles */}
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-primary/30"
            style={{
              left: `${20 + i * 15}%`,
              top: `${30 + (i % 3) * 20}%`
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.3, 0.8, 0.3],
              scale: [1, 1.5, 1]
            }}
            transition={{
              duration: 3 + i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.3
            }}
          />
        ))}
      </motion.div>

      {/* Corner Grid Pattern */}
      <div className="absolute top-0 left-0 w-64 h-64 opacity-10">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: 'radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }}
        />
      </div>
      <div className="absolute bottom-0 right-0 w-64 h-64 opacity-10">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: 'radial-gradient(circle, hsl(var(--secondary)) 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }}
        />
      </div>
    </div>
  );
}
