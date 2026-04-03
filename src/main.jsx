import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { warmupStorage } from './services/capacitor-storage.js';
import './index.css';

async function bootstrap() {
  // Aquece o cache em memória com todos os dados do Capacitor Preferences
  // antes de qualquer módulo que use o storage ser inicializado.
  await warmupStorage();

  // Importação dinâmica garante que App (e suas dependências: supabase.js,
  // authStore.js) só sejam instanciados DEPOIS do warmup.
  const { default: App } = await import('./App.jsx');

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap().catch((err) => {
  console.error('[Bootstrap] Falha crítica ao iniciar o app:', err);
  // Fallback: monta o app mesmo sem warmup para não deixar tela branca
  import('./App.jsx').then((module) => {
    // Declaramos a variável explicitamente no corpo da função
    const App = module.default; 
    
    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
});