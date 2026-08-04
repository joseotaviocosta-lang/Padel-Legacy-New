import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, StepBack, StepForward, Download, AlertTriangle, RotateCcw as RetryIcon } from 'lucide-react';
import { ReplayPlayer } from '@/gameplay/replay/ReplayPlayer.js';
import { Match2DRenderer } from '@/gameplay/replay/Match2DRenderer.js';
import { ReplayStorage } from '@/gameplay/replay/ReplayStorage.js';
import { ReplayPreferences } from '@/gameplay/replay/ReplayPreferences.js';
import { CAMERA_MODES, DEFAULT_VISUAL_OPTIONS } from '@/gameplay/replay/ReplayVisualConfig.js';
import { groupReplayPoints } from '@/gameplay/replay/ReplayImportantPoints.js';
import { BroadcastDirector } from '@/gameplay/replay/broadcast/BroadcastDirector.js';
import { MatchPresentationController } from '@/gameplay/replay/broadcast/MatchPresentationController.js';
import { BroadcastSettings, DEFAULT_BROADCAST_SETTINGS } from '@/gameplay/replay/broadcast/BroadcastSettings.js';
import BroadcastHUD from './BroadcastHUD.jsx';

const formatTime = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const button = 'p-2 rounded-lg bg-secondary hover:bg-secondary/80';

class ReplayPanelErrorBoundary extends React.Component {
  state = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error('[ReplayPanel] erro isolado', error, info);
  }

  retry = () => this.setState(({ retryKey }) => ({ error: null, retryKey: retryKey + 1 }));

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <h2 className="font-black">Erro no replay</h2>
              <p className="mt-1 text-sm text-muted-foreground">O replay não pôde ser exibido sem afetar a página de partidas.</p>
              <p className="mt-2 text-xs text-muted-foreground">{this.state.error?.message || 'Ocorreu um problema ao carregar o replay.'}</p>
              <button
                onClick={this.retry}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
              >
                <RetryIcon className="h-4 w-4" /> Tentar novamente
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

function ReplayPanelContent({ replay, live = false }) {
  const canvasRef = useRef(null);
  const playerRef = useRef(null);
  const rendererRef = useRef(null);
  const directorRef = useRef(null);
  const controllerRef = useRef(null);
  const replayRef = useRef(replay);
  const lastUi = useRef(0);

  const [state, setState] = useState({ status: 'idle', currentTime: 0, duration: replay?.duration || 0, speed: 1 });
  const [options, setOptions] = useState(DEFAULT_VISUAL_OPTIONS);
  const [broadcast, setBroadcast] = useState(DEFAULT_BROADCAST_SETTINGS);
  const [model, setModel] = useState(null);
  const [replaying, setReplaying] = useState(false);
  const [narration, setNarration] = useState('Jogadores em posição.');
  const [loadError, setLoadError] = useState(null);
  const [ready, setReady] = useState(false);

  const hasEvents = Array.isArray(replay?.events) && replay.events.length > 0;

  useEffect(() => {
    ReplayPreferences.load().then((saved) => {
      setOptions(saved);
      const preferred = [1, 2, 5, 10].includes(saved.replaySpeed) ? saved.replaySpeed : 1;
      playerRef.current?.setSpeed(preferred);
    });
    BroadcastSettings.load().then(setBroadcast);
  }, []);

  useEffect(() => {
    replayRef.current = replay;
  }, [replay]);

  useEffect(() => {
    if (!hasEvents) {
      setLoadError('Replay indisponível: esta partida não possui eventos gravados.');
      setReady(false);
      return;
    }

    const player = new ReplayPlayer({ allowIncomplete: live });
    const renderer = new Match2DRenderer(canvasRef.current, options);
    const director = new BroadcastDirector(replay, broadcast);
    const controller = new MatchPresentationController(player, director);

    playerRef.current = player;
    rendererRef.current = renderer;
    directorRef.current = director;
    controllerRef.current = controller;

    let animationEnabled = true;
    setLoadError(null);

    try {
      player.load(replay);
      if (live) {
        player.seek(replay.events.findLast((event) => event.type === 'point_start')?.t || 0);
      }
    } catch (error) {
      setLoadError(error?.message || 'Falha ao carregar o replay.');
      setReady(false);
      return () => {
        director.destroy();
        player.destroy();
      };
    }

    const unsubscribe = player.subscribe((next) => {
      if (!animationEnabled) return;
      const currentReplay = replayRef.current || replay;
      const scene = renderer.render(currentReplay, next.currentTime);
      const broadcastModel = director.update(next);
      const action = controller.onFrame(next, broadcastModel);

      if (action === 'start_replay') setReplaying(true);
      if (action === 'resume_live') setReplaying(false);

      renderer.setOptions({ cameraMode: broadcastModel.cameraMode });
      const now = performance.now();
      if (next.status !== 'playing' || now - lastUi.current > 100) {
        lastUi.current = now;
        setState(next);
        setNarration(scene.narration.text);
        setModel(broadcastModel);
      }
    });

    if (live) player.play();
    setReady(true);

    const handleBlur = () => {
      if (broadcast.pauseOnBlur) player.pause();
      directorRef.current?.audio.duck();
    };

    const handleFocus = () => {
      directorRef.current?.audio.resume();
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      animationEnabled = false;
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      unsubscribe();
      director.destroy();
      player.destroy();
      rendererRef.current = null;
      controllerRef.current = null;
      directorRef.current = null;
      playerRef.current = null;
      setReady(false);
    };
  }, [replay?.replay_id, live, hasEvents]);

  useEffect(() => {
    if (!ready) return;
    rendererRef.current?.setOptions(options);
    rendererRef.current?.render(replay, playerRef.current?.state.currentTime || 0);
    ReplayPreferences.save({ ...options, replaySpeed: state.speed });
  }, [options, ready, replay, state.speed]);

  useEffect(() => {
    directorRef.current?.setSettings(broadcast);
    BroadcastSettings.save(broadcast);
    setOptions((current) => ({
      ...current,
      cameraMode: broadcast.cameraMode,
      reducedMotion: broadcast.reducedMotion,
      highContrast: broadcast.highContrast,
      quality: broadcast.quality,
      enableCameraMotion: broadcast.cameraMotion,
    }));
  }, [broadcast]);

  const update = (key, value) => setOptions((current) => ({ ...current, [key]: value }));
  const updateBroadcast = (key, value) => setBroadcast((current) =>
    key === 'preset'
      ? BroadcastSettings.applyPreset(value, current)
      : { ...current, [key]: value }
  );

  const nextImportant = () => {
    const point = groupReplayPoints(replay).find((item) => item.important && item.start > (playerRef.current?.state.currentTime || 0));
    playerRef.current?.seek(point?.start ?? playerRef.current?.state.duration ?? 0);
  };

  const exportReplay = () => {
    if (!replay) return;
    const blob = new Blob([ReplayStorage.export(replay)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${replay.replay_id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const skipIntro = () => {
    playerRef.current?.seek(replay?.events.find((event) => event.type === 'point_start')?.t || 0);
  };

  if (loadError) {
    return (
      <div className="space-y-3 rounded-2xl border border-border/40 bg-secondary/50 p-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          <div>
            <h2 className="font-bold">Replay indisponível</h2>
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </div>
        </div>
        <div className="rounded-xl bg-secondary/80 p-4 text-sm text-muted-foreground">
          O placar e as estatísticas permanecem disponíveis enquanto o replay não pode ser reproduzido.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <canvas ref={canvasRef} className="w-full h-[440px] rounded-xl border border-border" aria-label="Replay 2D da partida" />
        <BroadcastHUD replay={replay} model={model} settings={broadcast} onSettings={updateBroadcast} onSkipIntro={skipIntro} replaying={replaying} />
      </div>

      <div aria-live="polite" className="rounded-lg bg-secondary/50 px-3 py-2 text-sm min-h-9">
        {broadcast.captionsEnabled ? narration : ''}
      </div>

      <input
        aria-label="Progresso"
        type="range"
        min="0"
        max={state.duration}
        value={state.currentTime}
        onChange={(e) => playerRef.current?.seek(+e.target.value)}
        className="w-full"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-label={state.status === 'playing' ? 'Pausar' : 'Reproduzir'}
          className={button}
          onClick={() => (state.status === 'playing' ? playerRef.current?.pause() : playerRef.current?.play())}
          disabled={!ready}
        >
          {state.status === 'playing' ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button aria-label="Reiniciar ponto" className={button} onClick={() => playerRef.current?.restartPoint()} disabled={!ready}>
          <RotateCcw size={16} />
        </button>
        <button aria-label="Evento anterior" className={button} onClick={() => playerRef.current?.stepBackward()} disabled={!ready}>
          <StepBack size={16} />
        </button>
        <button aria-label="Próximo evento" className={button} onClick={() => playerRef.current?.stepForward()} disabled={!ready}>
          <StepForward size={16} />
        </button>
        <button className={button} onClick={() => playerRef.current?.nextPoint()} disabled={!ready}>Próximo ponto</button>
        <button className={button} onClick={() => playerRef.current?.endGame()} disabled={!ready}>Fim do game</button>
        <button className={button} onClick={() => playerRef.current?.endSet()} disabled={!ready}>Fim do set</button>
        <button className={button} onClick={() => confirm('Simular até o fim da partida?') && playerRef.current?.endMatch()} disabled={!ready}>Fim da partida</button>
        <button className={button} onClick={nextImportant} disabled={!ready}>Importante</button>
        <div className="flex rounded-lg bg-secondary p-1" aria-label="Velocidade do replay">
          {[1, 2, 5, 10].map((speed) => (
            <button
              key={speed}
              aria-pressed={state.speed === speed}
              onClick={() => {
                playerRef.current?.setSpeed(speed);
                ReplayPreferences.save({ replaySpeed: speed });
              }}
              className={`rounded px-2 py-1 text-xs font-bold ${state.speed === speed ? 'bg-primary text-primary-foreground' : ''}`}
              disabled={!ready}
            >
              {speed}x
            </button>
          ))}
        </div>
        <span className="text-xs">{formatTime(state.currentTime)} / {formatTime(state.duration)}</span>
        <button aria-label="Exportar replay" className={button} onClick={exportReplay} disabled={!ready || !replay}>
          <Download size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <label>
          Câmera
          <select value={options.cameraMode} onChange={(e) => update('cameraMode', e.target.value)} className="block w-full bg-secondary rounded p-1">
            {CAMERA_MODES.map((mode) => (
              <option key={mode} value={mode}>{mode}</option>
            ))}
          </select>
        </label>
        <label>
          Jogador
          <select
            value={options.followedPlayerId || ''}
            onChange={(e) => update('followedPlayerId', e.target.value)}
            className="block w-full bg-secondary rounded p-1"
          >
            <option value="">Automático</option>
            {replay?.teams?.flatMap((team) => team.players || []).map((player) => (
              <option key={player.id} value={player.id}>{player.name}</option>
            ))}
          </select>
        </label>
        <label>
          Qualidade
          <select value={options.quality} onChange={(e) => update('quality', e.target.value)} className="block w-full bg-secondary rounded p-1">
            <option value="low">Baixa</option>
            <option value="medium">Média</option>
            <option value="high">Alta</option>
          </select>
        </label>
        <label>
          Bola
          <input
            type="range"
            min="1"
            max="2"
            step=".25"
            value={options.ballScale}
            onChange={(e) => update('ballScale', +e.target.value)}
            className="block w-full"
          />
        </label>
        <label>
          Texto
          <input
            type="range"
            min=".8"
            max="1.5"
            step=".1"
            value={broadcast.textScale}
            onChange={(e) => updateBroadcast('textScale', +e.target.value)}
            className="block w-full"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {[
          ['showTrails', 'rastro'],
          ['showBounceMarks', 'impactos'],
          ['showNames', 'nomes'],
          ['reducedMotion', 'movimento reduzido'],
          ['highContrast', 'alto contraste'],
          ['noFlashes', 'sem flashes'],
        ].map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={key in broadcast ? broadcast[key] : options[key]}
              onChange={(e) => (key in broadcast ? updateBroadcast(key, e.target.checked) : update(key, e.target.checked))}
            />
            {` ${label}`}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ReplayPanel(props) {
  return (
    <ReplayPanelErrorBoundary>
      <ReplayPanelContent {...props} />
    </ReplayPanelErrorBoundary>
  );
}
