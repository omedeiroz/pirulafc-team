// Logins fixos do time (sem cadastro).
// As senhas ficam só como hash scrypt ("salt:hash").
// Para trocar uma senha: npm run hash-password -- <nova-senha>  e cole o resultado aqui.
// role: 'player' (padrão) entra nas comps e no K/D/A; 'coach' só acessa e gerencia, sem jogar.
// admin: true = define a comp padrão de cada mapa e apaga do histórico. Os outros só sugerem comps.
module.exports = [
  { username: 'pepe', name: 'Pepe', password: '5ef79276bde0979025074dc6eaebb1a8:920439264f46c9b448994b26eafbe7dbd8f08f511f7fc424c723a085f55368943f3c8d3ef7c6c3d31b9c93f353b2a92c530caaf68b422b73c7731aeac4821199' },
  { username: 'hadez', name: 'Hadez', admin: true, password: '7948e8892c9724eeff53bffda6a3fb7f:b95cc9889f0a5d72420a5f69fb120cc4715562d2818306c984fba353f44324c792212d133a152d8d262dfd48fdb92a7a34270340ba57e696ce773f2d29556f3e' },
  { username: 'gbzin', name: 'Gbzin', role: 'coach', password: 'a35f079b1e4717715fcff638d57c685c:47566e1766fbe5acd5848157a255af50e3344116c54ca9644e22167e4296286c13171fd507c3f7726040e380f639cd8d6df3f7dd737a1eeca4c8f439cfcd10dc' },
  { username: 'sketch', name: 'Sketch', password: '0518d0843760b220247d2d0ff087a6c9:ae57afffbcac5fe88879a339531d02e3093e36052a4cec7db186491362d08fb4076b61dc6d56dd5b27957797cad5f5afb5d9cdde5961b05f8b53ab3263d0643a' },
  { username: 'eriquin', name: 'Eriquin', password: 'b7140bee96540774f936dac85ee93d98:3db01fd92838bddffec945a0784df58e5d67a573154cb333e97add8dbc42e4f8b6d3fb0c889c92e527d03eed685bc53c100534a9f728a87ea67b2702e6a6d44e' },
  { username: 'bobcabelinho', name: 'Bobcabelinho', password: '826996a641c7b1e67d1706e1a038646b:4ac0c6ddbe66b328db06faf3faea9c4fbb6eacad3f37b3c54504bf4b59865ede34d60956d860e177eff91b0302d3f4f9bd04c4d2dfd8c4c0317a4349f38bb705' },
];
