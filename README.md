# FofocaNH — MVP funcional

MVP mobile-first baseado no mockup aprovado. O projeto é intencionalmente simples e não exige instalação de bibliotecas: o servidor usa apenas APIs nativas do Node.js.

## O que funciona

- entrada sem cadastro por apelido ou como Anônimo;
- identidade anônima persistente por token no navegador;
- chat compartilhado em tempo real entre aparelhos conectados ao mesmo servidor;
- mensagens efêmeras (10 minutos);
- reações ❤️ 😂 😮, uma reação ativa por usuário/mensagem;
- Top 3 “Bombando Agora” explícito;
- mensagens Bombando recebem +30 s a cada nova reação de usuário;
- entrada orgânica no Bombando ao atingir 2 usuários únicos reagindo;
- Superchat integrado à mesma tela, em carrossel horizontal;
- Superchat de 1/2/5 minutos por 20/35/80 créditos;
- créditos controlados no servidor;
- +1 crédito a cada 2 minutos de presença ativa, com teto de 200;
- presença/contador de usuários online;
- sincronização em tempo real via Server-Sent Events (SSE);
- persistência em `data.json` no servidor;
- layout responsivo focado em celular.

## Rodar

Requer Node.js 20+.

```bash
cd fofocanh-mvp
npm start
```

Abra:

```text
http://localhost:3000
```

Para testar em outros celulares na mesma rede Wi‑Fi, abra `http://IP-DO-COMPUTADOR:3000` nesses aparelhos. O servidor escuta em `0.0.0.0` por padrão.

## Resetar a demonstração

Pare o servidor, apague `data.json` e execute `npm start` novamente. O servidor recria os dados iniciais.

## O que falta antes de abrir ao público

Este MVP é funcional, mas a publicação pública deve acrescentar uma camada de produção: HTTPS/proxy, rate limiting por IP/dispositivo, moderação e denúncias na interface, política de retenção, backups/observabilidade e uma base como PostgreSQL/Supabase no lugar do arquivo JSON. Um schema inicial de migração está em `supabase/schema.sql`.

Não venda créditos com dinheiro real antes de mover carteira, pagamentos e estornos para uma infraestrutura de banco transacional e revisar as regras jurídicas/operacionais aplicáveis.

## Regras atuais

- mensagem normal: 10 min;
- Bombando: Top 3;
- entrada no Bombando: 2 usuários únicos reagindo;
- tempo inicial Bombando: 3 min;
- reação nova durante Bombando: +30 s;
- crédito passivo: +1 / 2 min ativos, máximo 200;
- Superchat: 20 créditos/1 min, 35/2 min, 80/5 min.

Todos esses valores estão concentrados no código e podem ser recalibrados depois do primeiro teste real.
