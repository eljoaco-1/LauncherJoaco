'use strict';

import { logger, database, changePanel } from '../utils.js';

const { Launch, Status } = require('minecraft-java-core');
const { ipcRenderer, shell } = require('electron');
const launch = new Launch();
const pkg = require('../package.json');

const dataDirectory = process.env.APPDATA || (process.platform == 'darwin' ? `${process.env.HOME}/Library/Application Support` : process.env.HOME)

class Home {
    static id = "home";
    async init(config, news) {
        this.config = config
        this.news = await news
        this.database = await new database().init();
        this.initNews();
        this.initLaunch();
        this.initStatusServer();
        this.initBtn();
    }

    initNews() {
        let news = document.querySelector('.news-list');
        if (this.news) {
            if (!this.news.length) {
                let blockNews = document.createElement('div');
                blockNews.classList.add('news-block', 'opacity-1');
                blockNews.innerHTML = `
                    <div class="news-header">
                        <div class="header-text">
                            <div class="title">No hay noticias disponibles actualmente.</div>
                        </div>
                    </div>
                    <div class="news-content">
                        <div class="bbWrapper">
                            <p>Puede seguir aquí todas las noticias del servidor.</p>
                        </div>
                    </div>`
                news.appendChild(blockNews);
            } else {
                for (let News of this.news) {
                    let date = this.getdate(News.publish_date)
                    let blockNews = document.createElement('div');
                    blockNews.classList.add('news-block');
                    blockNews.innerHTML = `
                        <div class="news-header">
                            <div class="header-text">
                                <div class="title">${News.title}</div>
                            </div>
                            <div class="date">
                                <div class="day">${date.day}</div>
                                <div class="month">${date.month}</div>
                            </div>
                        </div>
                        <div class="news-content">
                            <div class="bbWrapper">
                                <p>${News.content.replace(/\n/g, '</br>')}</p>
                                <p class="news-author">Autor,<span> ${News.author}</span></p>
                            </div>
                        </div>`
                    news.appendChild(blockNews);
                    let newsLink = document.getElementById('news-link');
                    console.log(News.link)
                    newsLink.addEventListener('click', () => {
                        this.openlink(News.link);
                    }
                    )
                }
            }
        } else {
            let blockNews = document.createElement('div');
            blockNews.classList.add('news-block', 'opacity-1');
            blockNews.innerHTML = `
                <div class="news-header">
                    <div class="header-text">
                        <div class="title">Error.</div>
                    </div>
                </div>
                <div class="news-content">
                    <div class="bbWrapper">
                        <p>No se puede contactar al servidor de noticias.</br>Verifique su configuración.</p>
                    </div>
                </div>`
            // news.appendChild(blockNews);
        }
    }

    async initLaunch() {
        document.querySelector('.play-btn').addEventListener('click', async() => {
            let urlpkg = pkg.user ? `${pkg.url}/${pkg.user}` : pkg.url;
            let uuid = (await this.database.get('1234', 'accounts-selected')).value;
            let account = (await this.database.get(uuid.selected, 'accounts')).value;
            let ram = (await this.database.get('1234', 'ram')).value;
            let javaPath = (await this.database.get('1234', 'java-path')).value;
            let javaArgs = (await this.database.get('1234', 'java-args')).value;
            let Resolution = (await this.database.get('1234', 'screen')).value;
            let launcherSettings = (await this.database.get('1234', 'launcher')).value;
            let screen;

            let playBtn = document.querySelector('.play-btn');
            let info = document.querySelector(".text-download")
            let progressBar = document.querySelector(".progress-bar")

            if (Resolution.screen.width == '<auto>') {
                screen = false
            } else {
                screen = {
                    width: Resolution.screen.width,
                    height: Resolution.screen.height
                }
            }

            if (!launcherSettings.launcher.autoConnect) {
                //delete inside this.config.game_args array the element --server and the element that comes after him and the element --port and the element that comes after him if they exist
                let indexServer = this.config.game_args.indexOf('--server');
                if (indexServer > -1) {
                    this.config.game_args.splice(indexServer, 2);
                }
                let indexPort = this.config.game_args.indexOf('--port');
                if (indexPort > -1) {
                    this.config.game_args.splice(indexPort, 2);
                }

                console.log(this.config.game_args)
            }

            let opts = {
                url: this.config.game_url === "" || this.config.game_url === undefined ? `${urlpkg}/files` : this.config.game_url,
                authenticator: account,
                path: `${dataDirectory}/${process.platform == 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}`,
                version: this.config.game_version,
                detached: launcherSettings.launcher.close === 'close-all' ? false : true,
                java: this.config.java,
                javapath: javaPath.path,
                JVM_ARGS: [...javaArgs.args],
                GAME_ARGS: [...this.config.game_args],
                screen,
                modde: this.config.modde,
                verify: this.config.verify,
                loader: {
                    type: this.config.loader.type,
                    build: this.config.loader.build,
                    enable: this.config.loader.enable,
                },
                ignored: this.config.ignored,
                memory: {
                    min: `${ram.ramMin * 1024}M`,
                    max: `${ram.ramMax * 1024}M`
                }
            }

            playBtn.style.display = "none"
            info.style.display = "block"
            launch.Launch(opts);

            launch.on('extract', extract => {
                console.log(extract);
            });

            launch.on('progress', (progress, size) => {
                progressBar.style.display = "block"
                document.querySelector(".text-download").innerHTML = `Descargando ${((progress / size) * 100).toFixed(0)}%`
                ipcRenderer.send('main-window-progress', { progress, size })
                info.style.width = "200px"
                progressBar.value = progress;
                progressBar.max = size;
                //center the progress bar in the container
                progressBar.style.margin = "auto"
            });

            launch.on('check', (progress, size) => {
                progressBar.style.display = "block"
                document.querySelector(".text-download").innerHTML = `Vérification ${((progress / size) * 100).toFixed(0)}%`
                document.querySelector(".text-download").style.display = "inline"
                progressBar.value = progress;
                progressBar.max = size;
            });

            launch.on('estimated', (time) => {
                let hours = Math.floor(time / 3600);
                let minutes = Math.floor((time - hours * 3600) / 60);
                let seconds = Math.floor(time - hours * 3600 - minutes * 60);
                console.log(`${hours}h ${minutes}m ${seconds}s`);
            })

            launch.on('speed', (speed) => {
                console.log(`${(speed / 1067008).toFixed(2)} Mb/s`)
            })

            launch.on('patch', patch => {
                console.log(patch);
                info.innerHTML = `Verificando en progreso...`
            });

            launch.on('data', (e) => {
                new logger('Minecraft', '#36b030');
                if (launcherSettings.launcher.close === 'close-launcher') ipcRenderer.send("main-window-hide");
                ipcRenderer.send('main-window-progress-reset')
                progressBar.style.display = "none"
                info.innerHTML = `Iniciando en progreso...`
                info.style.width = "200px"
                console.log(e);
            });

            launch.on('close', code => {
                if (launcherSettings.launcher.close === 'close-launcher') ipcRenderer.send("main-window-show");
                progressBar.style.display = "none"
                info.style.display = "none"
                playBtn.style.display = "block"
                info.style.width = "140px"
                info.innerHTML = `Verificando <img style="width:28px;float:right;vertical-align: middle;" src="assets/images/background/492329d446c422b0483677d0318ab4fa.gif">`
                new logger('Launcher', '#7289da');
                
                console.log('Close');
            });

            launch.on('error', err => {
                console.log(err);
            });
        })
    }

    async initStatusServer() {
        let nameServer = document.querySelector('.server-text .name');
        let serverMs = document.querySelector('.server-text .desc');
        let playersConnected = document.querySelector('.etat-text .text');
        let online = document.querySelector(".etat-text .online");
        let serverPing = await new Status(this.config.status.ip, this.config.status.port).getStatus();

        if (!serverPing.error) {
            nameServer.textContent = this.config.status.nameServer;
            serverMs.innerHTML = `<span class="green">En ligne</span> - ${serverPing.ms}ms`;
            online.classList.toggle("off");
            playersConnected.textContent = serverPing.playersConnect;
        } else if (serverPing.error) {
            nameServer.textContent = 'Serveur indisponible';
            serverMs.innerHTML = `<span class="red">Hors ligne</span>`;
        }
    }

    initBtn() {

        document.querySelector('.settings-btn').addEventListener('click', () => {
            changePanel('settings');
        });

        document.querySelector('.player-head').addEventListener('click', () => {
            changePanel('panelSkin');
        });
        document.querySelector('.Discord').addEventListener('click', () => {
            this.openlink('https://discord.com');
        })
        document.querySelector('.Twitter').addEventListener('click', () => {
            this.openlink('https://twitter.com');
        })
        document.querySelector('.Github').addEventListener('click', () => {
            this.openlink('https://github.com');
        })
        document.querySelector('.Youtube').addEventListener('click', () => {
            this.openlink('https://youtube.com');
        })
        document.querySelector('.Instagram').addEventListener('click', () => {
            this.openlink('https://instagram.com');
        })
        document.querySelector('.Twitch').addEventListener('click', () => {
            this.openlink('https://twitch.tv');
        })
        document.querySelector('.MyWebsite').addEventListener('click', () => {
            this.openlink('https://fefe-du-973.fr');
        })
    }

    openlink(url) {
        shell.openExternal(url);
    }

    getdate(e) {
        let date = new Date(e)
        let year = date.getFullYear()
        let month = date.getMonth() + 1
        let day = date.getDate()
        let allMonth = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
        return { year: year, month: allMonth[month - 1], day: day }
    }
}
export default Home;
