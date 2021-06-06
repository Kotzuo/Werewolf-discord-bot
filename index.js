const Discord = require('discord.js');
const randomNumber = require('random-number-csprng');

const { prefix, token } = require('./config.json');

const client = new Discord.Client();

client.once('ready', () => {
  console.log('Ready!');
});

const game = {
  roles: {
    none: -1,
    werewolf: 0,
    villager: 1,
    doctor: 2,
    seer: 3,
  },
  rolesString: ['Lobisomem 🐺', 'Aldeão 🧍', 'Doutor 👨‍⚕️', 'Vidente 🔮'],
  villagersAlive: 0,
  werewolvesAlive: 0,
  rounds: 0,
  players: {},
  werewolves: [],
  villagers: [],
  doctor: {},
  seer: {},
};

async function sortRole(roleIndex) {
  let found = false;

  while (!found) {
    let randomIndex = await randomNumber(0, Object.keys(game.players).length - 1);
    const randomPlayer = Object.values(game.players)[randomIndex];

    if (randomPlayer.role === game.roles.none) {
      found = true;
      game.players[randomPlayer.discordUser.id].role = roleIndex;
      randomPlayer.discordUser.send(`Você é um ${game.rolesString[roleIndex]}`);

      if (roleIndex === 2) {
        game.doctor = randomPlayer;
        game.villagersAlive++;
      } else if (roleIndex === 3) {
        game.seer = randomPlayer;
        game.villagersAlive++;
      }
    }
  }
}

async function sortWerewolves(ammount) {
  for (let i = 0; i < ammount; i++) {
    let found = false;

    while (!found) {
      let randomIndex = await randomNumber(0, Object.keys(game.players).length - 1);
      const randomPlayer = Object.values(game.players)[randomIndex];

      if (randomPlayer.role === game.roles.none) {
        found = true;
        randomPlayer.role = game.roles.werewolf;
        game.werewolves.push(randomPlayer);
        game.werewolvesAlive++;
      }
    }
  }

  game.werewolves.forEach((werewolf) => {
    if (game.werewolves.length === 1) {
      return werewolf.discordUser.send(
        'Você é Lobisomem 🐺, ganhe matando os outros jogadores sem ser descoberto!',
      );
    }

    let wolves = 'Você é Lobisomem 🐺 juntamente com:\n';
    game.werewolves.forEach((element) => {
      if (werewolf.discordUser.id !== element.discordUser.id) {
        wolves += `- ${element.discordUser.username}\n`;
      }
    });
    werewolf.discordUser.send(wolves);
  });
}

function fillVillagers() {
  Object.values(game.players).forEach((player) => {
    if (player.role === game.roles.none) {
      game.players[player.discordUser.id].role = game.roles.villager;
      game.villagers.push(player);
      player.discordUser.send(`Você é um Aldeão 🧍`);
      game.villagersAlive++;
    }
  });
}

client.on('message', async (message) => {
  if (!message.content.startsWith(prefix) || message.author.bot) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'start') {
    try {
      const botMessage = await message.channel.send('Para jogar, reaja essa mensagem com 👍');
      await botMessage.react('👍');

      const collected = (
        await botMessage.awaitReactions(
          (reaction) => {
            return reaction.emoji.name === '👍';
          },
          { time: 5000 },
        )
      ).first();

      if (collected) {
        let playersNames = '';

        collected.users.cache.each((user) => {
          if (!user.bot) {
            game.players[user.id] = {
              discordUser: user,
              role: -1,
              confirmed: false,
              isAlive: true,
              vote: -1,
            };

            playersNames += `- <@${user.id}>\n`;
          }
        });

        if (collected.count - 1 < 5) {
          await message.channel.send(
            `Infelizmente não da pra jogar com apenas ${collected.count - 1} pessoa${
              collected.count - 1 != 0 && 's'
            }`,
          );
          return;
        }

        await message.channel.send(
          `Um total de ${
            collected.count - 1
          } pessoas quiseram participar, sendo elas:\n${playersNames}`,
        );

        // Esperar todo mundo confirmar se vai jogar
        const playersConfirmPromises = [];
        Object.values(game.players).forEach((player) => {
          playersConfirmPromises.push(
            new Promise((resolve) => {
              async function confirm() {
                const privateMessage = await player.discordUser.send(
                  'Confirme a participação do jogo!',
                );
                await privateMessage.react('👍');

                try {
                  const privateCollectedReaction = (
                    await privateMessage.awaitReactions(
                      (reaction) => {
                        return reaction.emoji.name === '👍';
                      },
                      { max: 1, time: 10000, errors: ['time'] },
                    )
                  ).first();

                  if (privateCollectedReaction) {
                    player.discordUser.send('Yay, sua participação foi confirmada! 😊');
                    player.confirmed = true;
                  }
                } catch (err) {
                  player.confirmed = false;
                }

                resolve();
              }

              confirm();
            }),
          );
        });

        await Promise.all(playersConfirmPromises);

        let rejectedPlayers = {
          stringList: '',
          count: 0,
        };

        Object.values(game.players).forEach((player) => {
          if (!player.confirmed) {
            rejectedPlayers.stringList += `- <@${player.discordUser.id}>\n`;
            rejectedPlayers.count += 1;
          }
        });

        if (!rejectedPlayers.count) {
          await message.channel.send('Todo mundo confirmou! 😊');
        } else if (rejectedPlayers.count === Object.keys(game.players).length) {
          await message.channel.send(`Ta me tirando tio 😡`);
          return;
        } else {
          await message.channel.send(
            `Os seguintes jogadores ficaram de fora por não confirmarem! 😥\n${rejectedPlayers.stringList}`,
          );
        }

        // Apagando jogadores que não confirmaram

        Object.values(game.players).forEach((player) => {
          if (!player.confirmed) {
            delete game.players[player.discordUser.id];
            return;
          }
        });

        // Decidir os cargos

        await sortWerewolves(2);
        await sortRole(game.roles.seer);
        await sortRole(game.roles.doctor);
        fillVillagers();

        // Começa o jogo

        let gameEnded = false;

        while (!gameEnded) {
          // Todo mundo decide oq vai fazer

          let huntedPerson = false;

          const playersVotesPromises = [];

          Object.values(game.werewolves).forEach((werewolf) => {
            if (werewolf.isAlive) {
              playersVotesPromises.push(
                new Promise((resolve) => {
                  const run = async () => {
                    try {
                      const otherPlayers = [];
                      let werewolfMessage = 'Quem você decide matar? 💀\n';
                      game.players.forEach((player) => {
                        if (player.isAlive) {
                          otherPlayers.push(player);
                          werewolfMessage += `${otherPlayers.length - 1} - ${
                            player.discordUser.username
                          }\n`;
                        }
                      });

                      const werewolfDiscordMessage = werewolf.discordUser.send(werewolfMessage);
                      let werewolfResponse;
                      await werewolfDiscordMessage.channel.awaitMessages(
                        (response) => {
                          werewolfResponse = parseInt(response.content);
                          return (
                            werewolfResponse >= 0 && werewolfResponse <= otherPlayers.length - 1
                          );
                        },
                        { max: 1, time: 20000, errors: ['time'] },
                      );

                      huntedPerson = otherPlayers[werewolfResponse];

                      await werewolf.discordUser.send(
                        `Voce escolheu matar ${otherPlayers[werewolfResponse].discordUser.username}!`,
                      );
                    } catch (err) {
                      werewolf.discordUser.send('Voce se abstraiu do voto 😐');
                    }

                    resolve();
                  };

                  run();
                }),
              );
            }
          });

          let savedPerson = false;

          if (game.doctor.isAlive) {
            playersVotesPromises.push(
              new Promise((resolve) => {
                const run = async () => {
                  try {
                    const otherPlayers = [];
                    let doctorMessage = 'Quem você decide salvar? 💖\n';
                    game.players.forEach((player) => {
                      if (player.isAlive) {
                        otherPlayers.push(player);
                        doctorMessage += `${otherPlayers.length - 1} - ${
                          player.discordUser.username
                        }\n`;
                      }
                    });

                    const doctorDiscordMessage = game.doctor.discordUser.send(doctorMessage);
                    let doctorResponse;
                    await doctorDiscordMessage.channel.awaitMessages(
                      (response) => {
                        doctorResponse = parseInt(response.content);
                        return doctorResponse >= 0 && doctorResponse <= otherPlayers.length - 1;
                      },
                      { max: 1, time: 20000, errors: ['time'] },
                    );

                    savedPerson = otherPlayers[doctorResponse];

                    await game.doctor.discordUser.send(
                      `Voce escolheu salvar ${otherPlayers[doctorResponse].discordUser.username}!`,
                    );
                  } catch (err) {
                    game.doctor.discordUser.send('Voce se abstraiu do voto 😐');
                  }
                  resolve();
                };

                run();
              }),
            );
          }

          if (game.seer.isAlive) {
            playersVotesPromises.push(
              new Promise((resolve) => {
                const run = async () => {
                  try {
                    const otherPlayers = [];
                    let seerMessage = 'Escolha um jogador para descobrir a verdade sobre ele 👀\n';
                    game.players.forEach((player) => {
                      if (player.isAlive && player.discordUser.id !== game.seer.discordUser.id) {
                        otherPlayers.push(player);
                        seerMessage += `${otherPlayers.length - 1} - ${
                          player.discordUser.username
                        }\n`;
                      }
                    });

                    const seerDiscordMessage = game.seer.discordUser.send(seerMessage);
                    let seerResponse;
                    await seerDiscordMessage.channel.awaitMessages(
                      (response) => {
                        seerResponse = parseInt(response.content);
                        return seerResponse >= 0 && seerResponse <= otherPlayers.length - 1;
                      },
                      { max: 1, time: 20000, errors: ['time'] },
                    );

                    if (otherPlayers[seerResponse].role === game.roles.werewolf) {
                      game.seer.discordUser.send(
                        `${otherPlayers[seerResponse].discordUser.username} é um lobisomem! 😲`,
                      );
                    } else {
                      game.seer.discordUser.send(
                        `${otherPlayers[seerResponse].discordUser.username} não é um lobisomem! 😌`,
                      );
                    }
                  } catch (err) {
                    game.seer.discordUser.send('Voce se abstraiu de saber quem é o lobisomem 😵');
                  }
                  resolve();
                };
                run();
              }),
            );
          }

          await Promise.all(playersVotesPromises);

          // Mostra os resultados

          if (!huntedPerson || savedPerson.discordUser.id === huntedPerson.discordUser.id) {
            message.channel.send(`Alguém foi salvo pelo medico 🤩`);
          } else {
            huntedPerson.isAlive = false;
            game.villagersAlive--;
            message.channel.send(`${huntedPerson.discordUser.username} morreu 😔`);
          }

          // Altera os cargos de vivos/mortos

          // Verificar se o jogo acabou
          if (game.villagersAlive > game.werewolvesAlive) {
            game.rounds++;
          } else {
            await message.channel.send(`Os lobos ganharam! 🐺🌑`);
          }

          // Pede para todo mundo votar para expulsar alguem

          let dayMessage = `A vila sobrevive mais um dia, estamos no ${game.rounds} dia, quem voces querem expulsar? ⚖️\n`;
          const playersAlive = [];
          Object.values(game.players).forEach((player) => {
            if (player.isAlive) {
              playersAlive.push(player);
              dayMessage += `${playersAlive.length - 1} - ${player.discordUser.username}\n`;
            }
          });

          await message.channel.send(dayMessage);

          const collector = message.channel.createMessageCollector(
            (dayVoteMessage) => {
              const playerResponse = parseInt(dayVoteMessage.content);
              return playerResponse >= 0 && playerResponse <= playersAlive.length - 1;
            },
            { time: 180000 },
          );

          const dayVotePromise = new Promise((resolve) => {
            let votes = 0;

            collector.on('collect', async (dayVoteMessage) => {
              if (!game.players[dayVoteMessage.author.id].vote) {
                votes++;
              }
              game.players[dayVoteMessage.author.id].vote = parseInt(dayVoteMessage);
              if (votes === playersAlive.length) {
                collector.stop('Todos os jogadores votaram');
              }

              await dayVoteMessage.react('👍');
            });

            collector.on('end', () => {
              const votes = new Array(playersAlive.length).fill(0);

              Object.values(game.players).forEach((player) => {
                if (player.isAlive && player.vote !== -1) {
                  votes[player.vote]++;
                }
              });

              const mostVotedQty = Math.max(...votes);
              if (mostVotedQty === 0) {
                message.channel.send(
                  `Ninguem foi escolhido pra morrer! 💀\nUma nova noite começa 🌑`,
                );
              } else {
                const mostVoted = votes.indexOf(mostVotedQty);

                playersAlive[mostVoted].isAlive = false;
                if (
                  playersAlive[mostVoted].role !== game.roles.werewolf &&
                  game.villagersAlive - 1 <= game.werewolvesAlive
                ) {
                  message.channel.send(
                    `${playersAlive[mostVoted].discordUser.id} foi escolhido para morrer! 💀\nOs lobisomens destruiram a vila! 🐺🩸💀`,
                  );
                  gameEnded = true;
                } else {
                  message.channel.send(
                    `${playersAlive[mostVoted].discordUser.id} foi escolhido para morrer! 💀\nUma nova noite começa 🌑`,
                  );
                }
              }
              resolve();
            });
          });

          await dayVotePromise();
        }
      } else {
        message.channel.send(`Pelo visto ninguem quer participar 😥`);
      }
    } catch (collected) {
      console.dir(collected);
      message.channel.send('Erro interno 😥');
    }
  }
});

client.login(token);
