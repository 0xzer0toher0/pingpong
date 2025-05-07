require("dotenv").config(); // Load variabel dari .env
const { ethers } = require("ethers");
const winston = require("winston"); // Logger pengganti loguru
const chalk = require("chalk"); // Untuk warna di console
const prompts = require("prompts"); // Untuk prompt input pengguna

// Konfigurasi logger menggunakan winston
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

// Konfigurasi provider untuk Somnia Network
const provider = new ethers.JsonRpcProvider("https://rpc.ankr.com/somnia_testnet/6e3fd81558cf77b928b06b38e9409b4677b637118114e83364486294d5ff4811"); // RPC Somnia
const chainId = 50312; // Somnia chain ID

// Inisialisasi wallet dari private key di .env
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
  throw new Error("PRIVATE_KEY not found in .env file");
}
const wallet = new ethers.Wallet(privateKey, provider);

// Inisialisasi EXPLORER_URL_SOMNIA langsung
const EXPLORER_URL_SOMNIA = "https://shannon-explorer.somnia.network/tx/0x";

// Konfigurasi statis (menggantikan somnia.config)
const config = {
  SOMNIA_NETWORK: {
    SOMNIA_SWAPS: {
      NUMBER_OF_SWAPS: { minTxs: 1, maxTxs: 3 },
      BALANCE_PERCENT_TO_SWAP: { minPercent: 10, maxPercent: 35 }, // Tidak digunakan
    },
  },
  SETTINGS: {
    RANDOM_PAUSE_BETWEEN_ACTIONS: [2, 5],
    PAUSE_BETWEEN_ATTEMPTS: [5, 10],
    ATTEMPTS: 3,
  },
};

// Indeks akun statis (menggantikan somnia.accountIndex)
const accountIndex = 1;

class PingPongSwaps {
  constructor(wallet) {
    this.wallet = wallet;
    this.accountIndex = accountIndex;
    this.config = config;
  }

  async swaps() {
    try {
      console.log(chalk.bgMagenta.white.bold("-------------------[ PING PONG SWAP BOT ]-------------------"));
      // Alamat kontrak
      const pingTokenAddress = ethers.getAddress("0x33e7fab0a8a5da1a923180989bd617c9c2d1c493");
      const pongTokenAddress = ethers.getAddress("0x9beaA0016c22B646Ac311Ab171270B0ECf23098F");
      const routerAddress = ethers.getAddress("0x6AAC14f090A35EeA150705f72D90E4CDC4a49b2C");

      // ABI untuk token dan router
      const tokenAbi = [
        {
          name: "balanceOf",
          inputs: [{ name: "owner", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
        {
          name: "approve",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          name: "allowance",
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
        {
          name: "transfer",
          inputs: [
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          name: "transferFrom",
          inputs: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
        {
          name: "decimals",
          inputs: [],
          outputs: [{ name: "", type: "uint8" }],
          stateMutability: "view",
          type: "function",
        },
        {
          name: "mint",
          inputs: [],
          outputs: [],
          stateMutability: "nonpayable",
          type: "function",
        },
      ];

      const routerAbi = [
        {
          name: "exactInputSingle",
          inputs: [
            {
              name: "params",
              type: "tuple",
              components: [
                { name: "tokenIn", type: "address" },
                { name: "tokenOut", type: "address" },
                { name: "fee", type: "uint24" },
                { name: "recipient", type: "address" },
                { name: "amountIn", type: "uint256" },
                { name: "amountOutMinimum", type: "uint256" },
                { name: "sqrtPriceLimitX96", type: "uint160" },
              ],
            },
          ],
          outputs: [{ name: "amountOut", type: "uint256" }],
          stateMutability: "nonpayable",
          type: "function",
        },
      ];

      // Inisialisasi kontrak
      const pingContract = new ethers.Contract(pingTokenAddress, tokenAbi, this.wallet);
      const pongContract = new ethers.Contract(pongTokenAddress, tokenAbi, this.wallet);

      // Cek saldo token
      let pingBalance = await pingContract.balanceOf(this.wallet.address);
      let pongBalance = await pongContract.balanceOf(this.wallet.address);

      logger.info(
        chalk.green(`✅ Balance checked: ${ethers.formatUnits(pingBalance, 18)} PING, ${ethers.formatUnits(pongBalance, 18)} PONG`)
      );
      console.log(
        chalk.cyan(`[BALANCE] 💰 Saldo di ${this.wallet.address}: ${ethers.formatUnits(pingBalance, 18)} PING, ${ethers.formatUnits(pongBalance, 18)} PONG 💰`)
      );

      // Cek jika kedua saldo nol
      if (pingBalance === 0n && pongBalance === 0n) {
        logger.error(
          chalk.red(`❌ ${this.accountIndex} | No tokens to swap. Both PING and PONG balances are zero.`)
        );
        console.log(
          chalk.red(`[ERROR] ❌ No tokens to swap. Both PING and PONG balances are zero. ❌`)
        );
        return false;
      }

      // Ambil jumlah swap dari konfigurasi
      const { minTxs, maxTxs } = this.config.SOMNIA_NETWORK.SOMNIA_SWAPS.NUMBER_OF_SWAPS;
      const numSwaps = Math.floor(Math.random() * (maxTxs - minTxs + 1)) + minTxs;

      logger.info(
        chalk.cyan(`🚀 ${this.accountIndex} | Planning to execute ${numSwaps} swaps`)
      );
      console.log(
        chalk.cyan(`[INFO] 🚀 Planning ${numSwaps} swaps 🚀`)
      );

      let successCount = 0;

      for (let i = 0; i < numSwaps; i++) {
        // Perbarui saldo sebelum setiap swap
        if (i > 0) {
          pingBalance = await pingContract.balanceOf(this.wallet.address);
          pongBalance = await pongContract.balanceOf(this.wallet.address);

          logger.info(
            chalk.green(`✅ Balance updated: ${ethers.formatUnits(pingBalance, 18)} PING, ${ethers.formatUnits(pongBalance, 18)} PONG`)
          );
          console.log(
            chalk.cyan(`[BALANCE] 💰 Saldo di ${this.wallet.address}: ${ethers.formatUnits(pingBalance, 18)} PING, ${ethers.formatUnits(pongBalance, 18)} PONG 💰`)
          );
        }

        // Skip jika kedua token memiliki saldo nol
        if (pingBalance === 0n && pongBalance === 0n) {
          logger.warn(
            chalk.yellow(`❗ ${this.accountIndex} | No tokens left to swap. Ending swap sequence.`)
          );
          console.log(
            chalk.yellow(`[WARN] ❗ No tokens left to swap. Ending swap sequence. ❗`)
          );
          break;
        }

        // Tentukan token untuk swap
        let tokenInAddress, tokenInName, tokenOutAddress, tokenOutName, tokenBalance;
        if (pingBalance > 0n && pongBalance > 0n) {
          if (Math.random() > 0.5) {
            tokenInAddress = pingTokenAddress;
            tokenInName = "PING";
            tokenOutAddress = pongTokenAddress;
            tokenOutName = "PONG";
            tokenBalance = pingBalance;
          } else {
            tokenInAddress = pongTokenAddress;
            tokenInName = "PONG";
            tokenOutAddress = pingTokenAddress;
            tokenOutName = "PING";
            tokenBalance = pongBalance;
          }
        } else if (pingBalance > 0n) {
          tokenInAddress = pingTokenAddress;
          tokenInName = "PING";
          tokenOutAddress = pongTokenAddress;
          tokenOutName = "PONG";
          tokenBalance = pingBalance;
        } else {
          tokenInAddress = pongTokenAddress;
          tokenInName = "PONG";
          tokenOutAddress = pingTokenAddress;
          tokenOutName = "PING";
          tokenBalance = pongBalance;
        }

        logger.info(
          chalk.cyan(`🚀 ${this.accountIndex} | Swap ${i + 1}/${numSwaps}: ${tokenInName} to ${tokenOutName}`)
        );
        console.log(
          chalk.blue(`[SWAP] 🔄 Swap ${i + 1}/${numSwaps}: ${tokenInName} to ${tokenOutName} 🔄`)
        );

        // Hitung jumlah untuk swap (acak 100 PING/PONG)
        const minAmount = 100; // Minimum jumlah token (dalam satuan token, bukan wei)
        const maxAmount = 100; // Maksimum jumlah token (bisa disesuaikan untuk rentang)
        const randomAmount = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
        const amountToSwap = ethers.parseUnits(randomAmount.toString(), 18); // Konversi ke wei (18 desimal)

        // Validasi saldo
        if (tokenBalance < amountToSwap) {
          logger.warn(
            chalk.yellow(`❗ ${this.accountIndex} | Insufficient ${tokenInName} balance (${ethers.formatUnits(tokenBalance, 18)} < ${randomAmount}). Skipping swap.`)
          );
          console.log(
            chalk.yellow(`[WARN] ❗ Insufficient ${tokenInName} balance (${ethers.formatUnits(tokenBalance, 18)} < ${randomAmount}). Skipping swap. ❗`)
          );
          continue;
        }

        logger.info(
          chalk.cyan(`🔄 ${this.accountIndex} | Swapping ${randomAmount} ${tokenInName} to ${tokenOutName}`)
        );
        console.log(
          chalk.blue(`[SWAP] 🔄 Swapping ${randomAmount} ${tokenInName} to ${tokenOutName} 🔄`)
        );

        // Cek allowance sebelum approve
        const tokenContract = new ethers.Contract(tokenInAddress, tokenAbi, this.wallet);
        const currentAllowance = await tokenContract.allowance(this.wallet.address, routerAddress);

        if (currentAllowance < amountToSwap) {
          logger.info(
            chalk.cyan(`🔓 ${this.accountIndex} | Approving ${randomAmount} ${tokenInName} for router`)
          );
          console.log(
            chalk.cyan(`[APPROVE] 🔓 Approving ${randomAmount} ${tokenInName} for router 🔓`)
          );
          const approveTx = await tokenContract.approve(routerAddress, amountToSwap);
          await approveTx.wait();
          logger.info(
            chalk.green(`✅ ${this.accountIndex} | Successfully approved ${tokenInName}`)
          );
          console.log(
            chalk.green(`[APPROVE] ✅ Approval for ${randomAmount} ${tokenInName} completed ✅`)
          );
        } else {
          logger.info(
            chalk.green(`✅ ${this.accountIndex} | No approval needed for ${tokenInName} (sufficient allowance)`)
          );
          console.log(
            chalk.green(`[APPROVE] ✅ No approval needed for ${tokenInName} (already approved) ✅`)
          );
        }

        // Siapkan parameter swap
        const swapParams = {
          tokenIn: tokenInAddress,
          tokenOut: tokenOutAddress,
          fee: 500, // 0.05%
          recipient: this.wallet.address,
          amountIn: amountToSwap,
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0,
        };

        // Buat kontrak router
        const routerContract = new ethers.Contract(routerAddress, routerAbi, this.wallet);

        // Eksekusi swap
        try {
          const swapTx = await routerContract.exactInputSingle(swapParams);
          logger.info(
            chalk.green(`✅ ${this.accountIndex} | Swap transaction sent: ${swapTx.hash}`)
          );
          console.log(
            chalk.green(`[TX] ✅ Transaction sent, TX Hash: ${swapTx.hash} ✅`)
          );

          const receipt = await swapTx.wait();
          logger.info(
            chalk.green(`✅ ${this.accountIndex} | Successfully swapped ${randomAmount} ${tokenInName} to ${tokenOutName}. TX: ${EXPLORER_URL_SOMNIA}${receipt.transactionHash}`)
          );
          console.log(
            chalk.green(`[TX] ✅ Transaction confirmed: ${EXPLORER_URL_SOMNIA}${receipt.transactionHash} ✅`)
          );
          successCount++;
        } catch (e) {
          logger.error(
            chalk.red(`❌ ${this.accountIndex} | Failed to swap ${tokenInName} to ${tokenOutName}: ${e.message}`)
          );
          console.log(
            chalk.red(`[SWAP] ❌ Swap failed: ${e.message} ❌`)
          );
          continue;
        }

        // Jeda antar swap
        if (i < numSwaps - 1) {
          const pause =
            Math.random() *
              (this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[1] -
                this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[0]) +
            this.config.SETTINGS.RANDOM_PAUSE_BETWEEN_ACTIONS[0];
          logger.info(
            chalk.cyan(`⏳ ${this.accountIndex} | Waiting ${pause.toFixed(1)} seconds before next swap...`)
          );
          console.log(
            chalk.cyan(`⠦ Waiting for next swap...`)
          );
          await new Promise((resolve) => setTimeout(resolve, pause * 1000));
        }
      }

      console.log(chalk.bgMagenta.white.bold("-------------------[ SWAP COMPLETED ]-------------------"));
      return successCount > 0;
    } catch (e) {
      const pause = Math.floor(
        Math.random() *
          (this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] -
            this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
        this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
      );
      logger.error(
        chalk.red(`❌ ${this.accountIndex} | Ping-pong swap error: ${e.message}. Sleeping ${pause} seconds...`)
      );
      console.log(
        chalk.red(`[ERROR] ❌ Swap bot error: ${e.message} ❌`)
      );
      await new Promise((resolve) => setTimeout(resolve, pause * 1000));
      return false;
    }
  }

  async send(recipient, percentToSend) {
    try {
      console.log(chalk.bgMagenta.white.bold("-------------------[ PING PONG SEND BOT ]-------------------"));
      // Ambil saldo wallet
      const balance = await provider.getBalance(this.wallet.address);

      logger.info(
        chalk.green(`✅ Balance checked: ${ethers.formatEther(balance)} SOMNIA`)
      );
      console.log(
        chalk.cyan(`[BALANCE] 💰 Saldo di ${this.wallet.address}: ${ethers.formatEther(balance)} SOMNIA 💰`)
      );

      // Hitung jumlah untuk dikirim
      const amountEther = Number(ethers.formatEther(balance)) * (percentToSend / 100);
      const roundedAmount = Math.round(amountEther * 100) / 100; // Bulatkan ke 4 desimal
      const amountToSend = ethers.parseEther(roundedAmount.toString()) * 95n / 100n; // 95% untuk cadangan gas

      logger.info(
        chalk.cyan(`🚀 ${this.accountIndex} | Starting send ${roundedAmount.toFixed(4)} SOMNIA to ${recipient}, ${percentToSend.toFixed(4)}% of balance...`)
      );
      console.log(
        chalk.blue(`[SEND] 🚀 Sending ${roundedAmount.toFixed(4)} SOMNIA to ${recipient} 🚀`)
      );

      // Kirim transaksi
      const tx = await this.wallet.sendTransaction({
        to: recipient,
        value: amountToSend,
        gasLimit: await provider.estimateGas({
          to: recipient,
          value: amountToSend,
        }),
      });

      logger.info(
        chalk.green(`✅ Transaction sent: ${tx.hash}`)
      );
      console.log(
        chalk.green(`[TX] ✅ Transaction sent, TX Hash: ${tx.hash} ✅`)
      );

      const receipt = await tx.wait();

      logger.info(
        chalk.green(`✅ Successfully sent ${roundedAmount.toFixed(4)} SOMNIA to ${recipient}. TX: ${EXPLORER_URL_SOMNIA}${receipt.transactionHash}`)
      );
      console.log(
        chalk.green(`[TX] ✅ Transaction confirmed: ${EXPLORER_URL_SOMNIA}${receipt.transactionHash} ✅`)
      );
      console.log(chalk.white.bold("-------------------[ SEND COMPLETED ]-------------------"));
      return true;
    } catch (e) {
      const pause = Math.floor(
        Math.random() *
          (this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] -
            this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
        this.config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
      );
      logger.error(
        chalk.red(`❌ ${this.accountIndex} | Send tokens error: ${e.message}. Sleeping ${pause} seconds...`)
      );
      console.log(
        chalk.red(`[ERROR] ❌ Send error: ${e.message} ❌`)
      );
      await new Promise((resolve) => setTimeout(resolve, pause * 1000));
      throw e;
    }
  }
}

// Retry utilitas
async function retryAsync(fn, attempts = null, delay = 1.0, backoff = 2.0, defaultValue = null) {
  const configAttempts = config.SETTINGS.ATTEMPTS;
  const retryAttempts = attempts !== null ? attempts : configAttempts;
  let currentDelay = delay;

  for (let attempt = 0; attempt < retryAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < retryAttempts - 1) {
        logger.warn(
          chalk.yellow(`❗ Attempt ${attempt + 1}/${retryAttempts} failed for ${fn.name}: ${e.message}. Retrying in ${currentDelay.toFixed(1)} seconds...`)
        );
        console.log(
          chalk.yellow(`[RETRY] ❗ Attempt ${attempt + 1}/${retryAttempts} failed: ${e.message}. Retrying... ❗`)
        );
        await new Promise((resolve) => setTimeout(resolve, currentDelay * 1000));
        currentDelay *= backoff;
      } else {
        logger.error(
          chalk.red(`❌ All ${retryAttempts} attempts failed for ${fn.name}: ${e.message}`)
        );
        console.log(
          chalk.red(`[ERROR] ❌ All retries failed: ${e.message} ❌`)
        );
        throw e;
      }
    }
  }
  return defaultValue;
}

// Fungsi utama dengan looping berdasarkan input pengguna
(async () => {
  try {
    // Prompt pengguna untuk jumlah loop
    const response = await prompts({
      type: 'number',
      name: 'loopCount',
      message: chalk.cyan('How many times do you want to loop the swaps? (Enter a number):'),
      validate: value => value > 0 ? true : 'Please enter a positive number'
    });

    const loopCount = response.loopCount;
    console.log(chalk.bgMagenta.white.bold(`-------------------[ STARTING ${loopCount} SWAP LOOPS ]-------------------`));

    const pingPongSwaps = new PingPongSwaps(wallet);

    for (let i = 0; i < loopCount; i++) {
      logger.info(
        chalk.cyan(`🚀 Starting swap loop ${i + 1}/${loopCount}`)
      );
      console.log(
        chalk.cyan(`[LOOP] 🚀 Starting swap loop ${i + 1}/${loopCount} 🚀`)
      );

      const result = await pingPongSwaps.swaps();
      console.log(chalk.green.bold(`Swap loop ${i + 1} result: ${result}`));

      // Jeda antar loop, kecuali untuk loop terakhir
      if (i < loopCount - 1) {
        const pause = Math.floor(
          Math.random() *
            (config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[1] -
              config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]) +
          config.SETTINGS.PAUSE_BETWEEN_ATTEMPTS[0]
        );
        logger.info(
          chalk.cyan(`⏳ Waiting ${pause} seconds before next loop...`)
        );
        console.log(
          chalk.cyan(`⠦ Waiting for next loop...`)
        );
        await new Promise((resolve) => setTimeout(resolve, pause * 1000));
      }
    }

    console.log(chalk.bgMagenta.white.bold("-------------------[ ALL LOOPS COMPLETED ]-------------------"));
  } catch (e) {
    console.error(chalk.red.bold(`Error: ${e.message}`));
  }
})();
