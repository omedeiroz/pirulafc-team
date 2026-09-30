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
npm run publicar   # compila, sobe o servidor e abre o túnel (baixa o cloudflared na 1ª vez)
```

Pare o `npm run dev` antes, porque os dois usam a porta 3000. Mande o link `https://xxxx.trycloudflare.com` que aparecer para o time.
O túnel precisa de saída na porta **7844** (UDP ou TCP); redes corporativas costumam bloquear essa porta. Nesse caso, rode de uma rede de casa. O link muda toda vez que o túnel reinicia; para um endereço fixo, crie um túnel nomeado numa conta Cloudflare com domínio próprio.

### Opção B: 24h grátis com Render + MongoDB Atlas

O plano grátis do Render não tem disco persistente, então os dados e as fotos ficam no MongoDB Atlas (grátis, 512 MB).
Com `MONGODB_URI` definida, o site usa o Mongo; sem ela, usa os arquivos em `data/` (como no `npm run dev`).

**1. MongoDB Atlas**
1. Crie uma conta em [mongodb.com/atlas](https://www.mongodb.com/atlas) e um cluster **Free (M0)**.
2. Em *Database Access*, crie um usuário com senha.
3. Em *Network Access*, libere `0.0.0.0/0`. O Render não tem IP fixo no plano grátis; o acesso continua protegido pela senha do usuário do banco.
4. Em *Connect → Drivers*, copie a string `mongodb+srv://usuario:senha@...` e troque `<password>` pela senha.

**2. Levar os dados atuais para o Atlas** (uma vez, no seu PC)
```powershell
# adicione ao .env: MONGODB_URI=mongodb+srv://...
npm run migrar
```
Depois de migrar, tire o `MONGODB_URI` do `.env` local se quiser que o `npm run dev` continue usando os arquivos em `data/`.

**3. Render**
1. Crie uma conta em [render.com](https://render.com) entrando com o GitHub.
2. *New → Blueprint* e escolha o repositório. O `render.yaml` já configura build, start e health check.
3. Quando pedir, cole `MONGODB_URI` e `HENRIKDEV_API_KEY`.
4. Quando o deploy terminar, o link fica em `https://<nome>.onrender.com`.

No plano grátis, o site dorme após ~15 min sem acesso; o primeiro acesso depois disso leva uns 50 s. Cada push na `main` gera um deploy novo automaticamente.

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
