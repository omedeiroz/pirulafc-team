# Comps

Site do time de Valorant para organizar comps por mapa, definir quem joga qual agente e guardar o histórico de campeonatos.

## O que tem

- **Login fixo** (sem cadastro). Os usuários ficam em `src/users.js`, com a senha guardada como hash. Quem tem `role: 'coach'` (hoje o Gbzin) acessa e gerencia tudo, mas não entra nas comps nem no K/D/A.
- **Mapas e comps**: rotação atual, comps do meta pro e montador de comp (agente + player). A comp confirmada fica salva, com histórico.
- **Campeonatos**: nome, link, organizador, colocação e partidas (mapa, placar, VOD, K/D/A/ACS por player).
- **Jogadores**: agente de cada player em cada mapa e estatísticas somadas de todos os campeonatos.
- **Perfil** (`/perfil`, ou `/jogadores/<usuario>` para ver o de outra pessoa):
  - foto e banner;
  - até 2 funções (Duelista, Controlador, Sentinela, Iniciador, Flex);
  - 3 agentes favoritos;
  - agente que a pessoa joga em cada mapa;
  - histórico individual (K/D, KDA, ACS, por agente, por mapa e partida a partida), calculado a partir dos campeonatos.

  As imagens ficam em `data/uploads/`.

## De onde vêm os dados (tudo dinâmico)

| Dado | Fonte |
|---|---|
| Comps do meta | API do [THESPIKE.GG](https://www.thespike.gg/valorant-stats/agents-compositions), **somente eventos oficiais do VCT** (Kickoff, Stages, Masters, Champions). Showmatch, Game Changers e Challengers ficam de fora. |
| Map pool / rotação | Map pool do evento oficial do VCT mais recente (THESPIKE.GG) |
| Agentes, funções e imagens | [valorant-api.com](https://valorant-api.com) |

As respostas ficam em cache (`data/api-cache.json`). Se alguma API cair, o site usa a última resposta válida.
"Meta atual" junta os eventos oficiais que começaram nos últimos 100 dias (ou que estão em andamento). Também dá para ver a temporada inteira ou um evento específico.

## Permissões

- Quem tem `admin: true` em `src/users.js` (hoje o **Hadez**) define a **comp padrão** de cada mapa e apaga do histórico.
- Os outros montam comps e enviam como **sugestão**, já com os players de cada agente. O admin transforma uma sugestão em padrão com um clique.
- Cada um só apaga as próprias sugestões; o admin apaga qualquer uma.
- Sugestões com o mesmo nome ou a mesma comp (agentes + players) no mesmo mapa são bloqueadas.

## Elo (HenrikDev API)

Cada jogador vincula o Riot ID no perfil (card "Conta Riot") e o elo aparece no perfil e na página Jogadores (cache de 10 min).
A API oficial da Riot não libera elo individual, então usamos a [HenrikDev API](https://docs.henrikdev.xyz), que não é oficial.
A chave fica no `.env` (veja `.env.example`), que **não vai para o git**:

```
HENRIKDEV_API_KEY=HDEV-...
```

## Rodando

Requer Node 20+.

```bash
npm install
npm run dev        # API em :3000 + front React (Vite) em http://localhost:5173
```

Produção:

```bash
npm run build      # compila o React para client/dist
npm start          # serve API + front em http://localhost:3000 (PORT para mudar)
```

Os dados do time (comps, campeonatos) ficam em `data/db.json`. **Faça backup dessa pasta.** Se hospedar, use um lugar com disco persistente (VPS, Railway/Render com volume, etc.) e HTTPS.

## Colocar no ar para o time

**Antes:** cada um entra e troca a senha padrão em *Perfil → Trocar senha* (o site avisa no topo enquanto não trocar).

### Opção A: do seu PC com Cloudflare Tunnel (grátis, na hora)

O site fica no ar enquanto o seu PC estiver ligado e os dois comandos rodando.

```powershell
winget install --id Cloudflare.cloudflared      # uma vez só
$env:TRUST_PROXY=1; npm run prod                # terminal 1: compila e sobe em :3000
cloudflared tunnel --url http://localhost:3000  # terminal 2: mostra o link https://xxxx.trycloudflare.com
```

Mande o link `trycloudflare.com` para o time. O link muda toda vez que o túnel reinicia; para um endereço fixo, crie um túnel nomeado numa conta Cloudflare com domínio próprio.

### Opção B: hospedagem 24h (ex.: Railway)

1. Suba o projeto para um repositório **privado** no GitHub. O `.env` e a pasta `data/` ficam de fora.
2. Crie o serviço a partir do repositório. Build: `npm run build`. Start: `npm start`.
3. Adicione um **volume** (disco persistente) montado em `/data`.
4. Variáveis de ambiente: `DATA_DIR=/data`, `TRUST_PROXY=1`, `HENRIKDEV_API_KEY=...`.
5. Gere o domínio público nas configurações do serviço.

Sem volume, as comps, os campeonatos e as fotos somem a cada deploy.

## Trocar senha

Cada usuário pode trocar a própria senha no perfil. Trocar a senha desconecta os outros aparelhos logados.
A senha inicial de cada conta fica em `src/users.js` e é usada até a pessoa trocar. Para mudar a senha inicial:

```bash
npm run hash-password -- novaSenha
```

Cole o resultado no campo `password` do usuário em `src/users.js` e reinicie o servidor.

## Estrutura

```
server.js            API Express (auth, comps, campeonatos)
src/spike.js         THESPIKE.GG: eventos VCT, map pool, comps
src/valorant.js      valorant-api.com: agentes e imagens
src/remote.js        fetch com cache em memória + disco
src/db.js            banco JSON do time
client/              front-end React (Vite + React Router)
```
