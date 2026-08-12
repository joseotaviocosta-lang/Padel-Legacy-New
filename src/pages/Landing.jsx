import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Users, Swords, Flame, Zap, Globe, Crown, ArrowRight, Star, TrendingUp, Target } from 'lucide-react';

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 glass border-b border-border/40">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center"><span className="text-primary-foreground font-black text-lg">P</span></div>
            <div>
              <h1 className="font-black text-lg leading-none tracking-tight">PADEL</h1>
              <p className="text-primary font-bold text-[10px] tracking-[0.3em] leading-none mt-0.5">LEGACY</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#concept" className="hover:text-foreground transition-colors">Conceito</a>
            <a href="#features" className="hover:text-foreground transition-colors">Recursos</a>
            <a href="#community" className="hover:text-foreground transition-colors">Comunidade</a>
          </div>
          <Link to="/game" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity glow-primary">
            Entrar <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 grid-bg">
        <div className="absolute top-20 left-1/4 h-72 w-72 bg-primary/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 bg-accent/15 rounded-full blur-[100px]" />
        <div className="relative max-w-4xl mx-auto px-4 md:px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass mb-6">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-medium text-muted-foreground">O universo digital do padel mundial</span>
          </div>
          <h1 className="font-black text-4xl md:text-7xl tracking-tighter leading-[1.05]">
            Construa seu<br /><span className="text-primary text-glow">legado</span> no padel.
          </h1>
          <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Não criamos apenas um aplicativo de padel. Criamos um universo onde cada jogador constrói sua carreira, seu ranking e sua história — unindo jogo, comunidade e competição.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/game" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity glow-primary">
              Começar agora <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#features" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl glass text-foreground font-semibold text-sm hover:border-primary/40 transition-colors">
              Conhecer recursos
            </a>
          </div>
          <div className="mt-12 flex items-center justify-center gap-8 text-center">
            <div><p className="text-2xl font-black text-primary">6</p><p className="text-xs text-muted-foreground">Níveis</p></div>
            <div className="h-8 w-px bg-border" />
            <div><p className="text-2xl font-black text-primary">8</p><p className="text-xs text-muted-foreground">Atributos</p></div>
            <div className="h-8 w-px bg-border" />
            <div><p className="text-2xl font-black text-primary">∞</p><p className="text-xs text-muted-foreground">Possibilidades</p></div>
          </div>
        </div>
      </section>

      {/* Concept */}
      <section id="concept" className="py-20 px-4 md:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">Mais que um app. <span className="text-primary">Um universo.</span></h2>
            <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">Uma mistura de plataforma esportiva, jogo de evolução de atletas, comunidade mundial e sistema competitivo.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: TrendingUp, title: 'Evolução de carreira', desc: 'Cada partida evolui seus atributos: saque, voleio, bandeja, defesa, ataque e mais. Suba de Iniciante a Lenda.' },
              { icon: Trophy, title: 'Competição mundial', desc: 'Rankings individuais, de duplas, clubes e países. Torneios locais, ligas e campeonatos mundiais.' },
              { icon: Users, title: 'Comunidade esportiva', desc: 'Siga jogadores, adicione amigos, publique conquistas e viva o feed social do padel.' },
            ].map((f) => (
              <div key={f.title} className="glass rounded-2xl p-6 hover:border-primary/30 transition-colors">
                <div className="h-12 w-12 rounded-xl bg-primary/15 flex items-center justify-center mb-4"><f.icon className="h-6 w-6 text-primary" /></div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="py-20 px-4 md:px-6 grid-bg">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">Tudo que o padel precisa</h2>
            <p className="mt-4 text-muted-foreground">Do perfil de carreira à economia do ecossistema.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Zap, title: 'Sistema de evolução', desc: 'XP, níveis e atributos que evoluem com cada partida.' },
              { icon: Swords, title: 'Registro de partidas', desc: 'Placar, duplas, adversários e análise de desempenho.' },
              { icon: Trophy, title: 'Rankings completos', desc: 'Individual, duplas, clubes e ranking internacional.' },
              { icon: Crown, title: 'Campeonatos', desc: 'Torneios locais, ligas, regionais e mundial.' },
              { icon: Users, title: 'Clubes & comunidades', desc: 'Crie equipes, organize eventos e desafios.' },
              { icon: Star, title: 'Gamificação', desc: 'Medalhas, troféus, badges e conquistas raras.' },
              { icon: Target, title: 'Personalização', desc: 'Avatares, raquetes, equipamentos e acessórios.' },
              { icon: Flame, title: 'Feed social', desc: 'Compartilhe resultados e conquistas com a comunidade.' },
              { icon: Globe, title: 'Futuro com IA', desc: 'Treinador IA, analista de partidas e matchmaking.' },
            ].map((f) => (
              <div key={f.title} className="glass rounded-2xl p-5 hover:border-primary/30 transition-colors">
                <f.icon className="h-6 w-6 text-primary mb-3" />
                <h3 className="font-bold text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="community" className="py-24 px-4 md:px-6">
        <div className="max-w-3xl mx-auto text-center relative">
          <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full" />
          <div className="relative glass rounded-3xl p-8 md:p-12 grid-bg">
            <Crown className="h-12 w-12 text-amber-400 mx-auto mb-4" />
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">Seu legado começa agora</h2>
            <p className="mt-4 text-muted-foreground max-w-xl mx-auto">"Criamos um universo onde cada jogador constrói seu legado."</p>
            <Link to="/game" className="mt-8 inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity glow-primary">
              Entrar no Padel Legacy <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 px-4 md:px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center"><span className="text-primary-foreground font-black text-sm">P</span></div>
            <span className="font-black text-sm">PADEL <span className="text-primary">LEGACY</span></span>
          </div>
          <p className="text-xs text-muted-foreground">Sports Tech · Gaming · Community Platform</p>
        </div>
      </footer>
    </div>
  );
}