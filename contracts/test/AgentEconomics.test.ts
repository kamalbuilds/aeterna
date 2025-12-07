import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("AgentEconomics", function () {
  // Test constants
  const PRECISION = ethers.parseEther("1"); // 1e18
  const BASE_PRICE = ethers.parseEther("0.01"); // 0.01 ETH
  const PRICE_MULTIPLIER = ethers.parseEther("0.001"); // 0.001 ETH
  const MAX_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
  const STAKING_AMOUNT = ethers.parseEther("100"); // 100 tokens
  const LOCK_PERIOD = 86400; // 1 day
  const REWARD_RATE = 1000; // 10% APR in basis points

  async function deployEconomicsFixture() {
    // Get signers
    const [deployer, user1, user2, user3, treasury] = await ethers.getSigners();

    // Deploy mock ERC20 token for testing
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000000"));

    // Deploy AgentIdentity first
    const AgentIdentity = await ethers.getContractFactory("AgentIdentity");
    const agentIdentity = await AgentIdentity.deploy(
      deployer.address,
      deployer.address,
      deployer.address
    );

    // Deploy AgentEconomics
    const AgentEconomics = await ethers.getContractFactory("AgentEconomics");
    const agentEconomics = await AgentEconomics.deploy(
      await agentIdentity.getAddress(),
      await mockToken.getAddress(), // Use ERC20 instead of ETH for easier testing
      deployer.address
    );

    await agentIdentity.waitForDeployment();
    await agentEconomics.waitForDeployment();
    await mockToken.waitForDeployment();

    // Create test agent
    await agentIdentity.connect(user1).createAgent(
      "test_trader",
      ["trading", "analysis"],
      ethers.keccak256(ethers.toUtf8Bytes("test metadata"))
    );

    // Mint tokens to users for testing
    await mockToken.mint(user1.address, ethers.parseEther("10000"));
    await mockToken.mint(user2.address, ethers.parseEther("10000"));
    await mockToken.mint(user3.address, ethers.parseEther("10000"));

    // Approve economics contract to spend tokens
    await mockToken.connect(user1).approve(await agentEconomics.getAddress(), ethers.MaxUint256);
    await mockToken.connect(user2).approve(await agentEconomics.getAddress(), ethers.MaxUint256);
    await mockToken.connect(user3).approve(await agentEconomics.getAddress(), ethers.MaxUint256);

    return {
      agentEconomics,
      agentIdentity,
      mockToken,
      deployer,
      user1,
      user2,
      user3,
      treasury
    };
  }

  async function deployWithBondingCurveFixture() {
    const fixture = await loadFixture(deployEconomicsFixture);
    const { agentEconomics, user1 } = fixture;

    // Configure bonding curve for agent 1
    const bondingCurve = {
      curveType: 0, // Linear
      basePrice: BASE_PRICE,
      priceMultiplier: PRICE_MULTIPLIER,
      maxSupply: MAX_SUPPLY,
      currentSupply: 0,
      reserveRatio: 500000, // 50%
      curveParameters: "0x"
    };

    await agentEconomics.connect(user1).configureBondingCurve(1, bondingCurve);

    return { ...fixture, agentId: 1 };
  }

  describe("Deployment", function () {
    it("Should deploy with correct parameters", async function () {
      const { agentEconomics, agentIdentity, mockToken, deployer } = await loadFixture(deployEconomicsFixture);

      expect(await agentEconomics.agentRegistry()).to.equal(await agentIdentity.getAddress());
      expect(await agentEconomics.baseToken()).to.equal(await mockToken.getAddress());

      // Check default economic parameters
      expect(await agentEconomics.economicParameters("tradingFee")).to.equal(100); // 1%
      expect(await agentEconomics.economicParameters("stakingFee")).to.equal(50);  // 0.5%
      expect(await agentEconomics.economicParameters("unbondingFee")).to.equal(200); // 2%
    });

    it("Should have correct roles assigned", async function () {
      const { agentEconomics, deployer } = await loadFixture(deployEconomicsFixture);

      const DEFAULT_ADMIN_ROLE = await agentEconomics.DEFAULT_ADMIN_ROLE();
      const ECONOMICS_ADMIN_ROLE = await agentEconomics.ECONOMICS_ADMIN_ROLE();
      const TREASURY_MANAGER_ROLE = await agentEconomics.TREASURY_MANAGER_ROLE();

      expect(await agentEconomics.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.true;
      expect(await agentEconomics.hasRole(ECONOMICS_ADMIN_ROLE, deployer.address)).to.be.true;
      expect(await agentEconomics.hasRole(TREASURY_MANAGER_ROLE, deployer.address)).to.be.true;
    });
  });

  describe("Bonding Curves", function () {
    describe("Configuration", function () {
      it("Should configure bonding curve successfully", async function () {
        const { agentEconomics, user1 } = await loadFixture(deployEconomicsFixture);

        const bondingCurve = {
          curveType: 0, // Linear
          basePrice: BASE_PRICE,
          priceMultiplier: PRICE_MULTIPLIER,
          maxSupply: MAX_SUPPLY,
          currentSupply: 0,
          reserveRatio: 500000,
          curveParameters: "0x"
        };

        await expect(
          agentEconomics.connect(user1).configureBondingCurve(1, bondingCurve)
        ).to.emit(agentEconomics, "BondingCurveConfigured")
          .withArgs(1, 0); // Linear curve type

        const storedCurve = await agentEconomics.getBondingCurve(1);
        expect(storedCurve.curveType).to.equal(0);
        expect(storedCurve.basePrice).to.equal(BASE_PRICE);
        expect(storedCurve.priceMultiplier).to.equal(PRICE_MULTIPLIER);
        expect(storedCurve.maxSupply).to.equal(MAX_SUPPLY);
      });

      it("Should fail to configure curve with invalid parameters", async function () {
        const { agentEconomics, user1 } = await loadFixture(deployEconomicsFixture);

        const invalidCurve = {
          curveType: 0,
          basePrice: 0, // Invalid base price
          priceMultiplier: PRICE_MULTIPLIER,
          maxSupply: MAX_SUPPLY,
          currentSupply: 0,
          reserveRatio: 500000,
          curveParameters: "0x"
        };

        await expect(
          agentEconomics.connect(user1).configureBondingCurve(1, invalidCurve)
        ).to.be.revertedWithCustomError(agentEconomics, "InvalidCurveParameters");
      });

      it("Should fail to configure curve for non-existent agent", async function () {
        const { agentEconomics, user1 } = await loadFixture(deployEconomicsFixture);

        const bondingCurve = {
          curveType: 0,
          basePrice: BASE_PRICE,
          priceMultiplier: PRICE_MULTIPLIER,
          maxSupply: MAX_SUPPLY,
          currentSupply: 0,
          reserveRatio: 500000,
          curveParameters: "0x"
        };

        await expect(
          agentEconomics.connect(user1).configureBondingCurve(999, bondingCurve)
        ).to.be.revertedWithCustomError(agentEconomics, "AgentNotFound");
      });

      it("Should fail to configure curve without authorization", async function () {
        const { agentEconomics, user2 } = await loadFixture(deployEconomicsFixture);

        const bondingCurve = {
          curveType: 0,
          basePrice: BASE_PRICE,
          priceMultiplier: PRICE_MULTIPLIER,
          maxSupply: MAX_SUPPLY,
          currentSupply: 0,
          reserveRatio: 500000,
          curveParameters: "0x"
        };

        await expect(
          agentEconomics.connect(user2).configureBondingCurve(1, bondingCurve)
        ).to.be.revertedWith("Not authorized for agent");
      });
    });

    describe("Price Calculation", function () {
      it("Should calculate linear bonding price correctly", async function () {
        const { agentEconomics, agentId } = await loadFixture(deployWithBondingCurveFixture);

        const amount = ethers.parseEther("10"); // 10 tokens
        const [price, pricePerToken] = await agentEconomics.getBondPrice(agentId, amount);

        // Linear price: basePrice + (currentSupply * priceMultiplier / precision) = 0.01 ETH (since currentSupply = 0)
        expect(pricePerToken).to.equal(BASE_PRICE);
        expect(price).to.equal(BASE_PRICE * amount / PRECISION);
      });

      it("Should calculate price correctly after some tokens are bonded", async function () {
        const { agentEconomics, mockToken, user2, agentId } = await loadFixture(deployWithBondingCurveFixture);

        // First user bonds 10 tokens
        const firstAmount = ethers.parseEther("10");
        const [firstPrice] = await agentEconomics.getBondPrice(agentId, firstAmount);

        await agentEconomics.connect(user2).bondTokens(agentId, firstAmount, firstPrice);

        // Now get price for next 10 tokens (should be higher due to linear curve)
        const secondAmount = ethers.parseEther("10");
        const [secondPrice, secondPricePerToken] = await agentEconomics.getBondPrice(agentId, secondAmount);

        expect(secondPricePerToken).to.be.gt(BASE_PRICE); // Price should increase
        expect(secondPrice).to.be.gt(firstPrice); // Total price should be higher
      });
    });

    describe("Bonding", function () {
      it("Should bond tokens successfully", async function () {
        const { agentEconomics, mockToken, user2, agentId } = await loadFixture(deployWithBondingCurveFixture);

        const amount = ethers.parseEther("10");
        const [price] = await agentEconomics.getBondPrice(agentId, amount);
        const maxPrice = price + price / BigInt(10); // 10% slippage

        const initialBalance = await mockToken.balanceOf(user2.address);

        await expect(
          agentEconomics.connect(user2).bondTokens(agentId, amount, maxPrice)
        ).to.emit(agentEconomics, "TokensBonded")
          .withArgs(agentId, user2.address, amount, amount, price);

        // Check token balance decreased
        const finalBalance = await mockToken.balanceOf(user2.address);
        expect(finalBalance).to.equal(initialBalance - price);

        // Check economic metrics updated
        const metrics = await agentEconomics.getEconomicMetrics(agentId);
        expect(metrics.totalBonded).to.equal(amount);
        expect(metrics.holdersCount).to.be.gt(0);
      });

      it("Should fail bonding with insufficient allowance", async function () {
        const { agentEconomics, mockToken, user2, agentId } = await loadFixture(deployWithBondingCurveFixture);

        // Reset allowance
        await mockToken.connect(user2).approve(await agentEconomics.getAddress(), 0);

        const amount = ethers.parseEther("10");
        const [price] = await agentEconomics.getBondPrice(agentId, amount);

        await expect(
          agentEconomics.connect(user2).bondTokens(agentId, amount, price)
        ).to.be.revertedWithCustomError(mockToken, "ERC20InsufficientAllowance");
      });

      it("Should fail bonding if price exceeds maximum", async function () {
        const { agentEconomics, user2, agentId } = await loadFixture(deployWithBondingCurveFixture);

        const amount = ethers.parseEther("10");
        const [price] = await agentEconomics.getBondPrice(agentId, amount);
        const maxPrice = price / BigInt(2); // Set max price lower than actual

        await expect(
          agentEconomics.connect(user2).bondTokens(agentId, amount, maxPrice)
        ).to.be.revertedWith("Price exceeds maximum");
      });

      it("Should fail bonding with amount below minimum", async function () {
        const { agentEconomics, user2, agentId } = await loadFixture(deployWithBondingCurveFixture);

        const tinyAmount = ethers.parseWei("1", "gwei"); // Very small amount
        const [price] = await agentEconomics.getBondPrice(agentId, tinyAmount);

        await expect(
          agentEconomics.connect(user2).bondTokens(agentId, tinyAmount, price)
        ).to.be.revertedWithCustomError(agentEconomics, "InvalidBondingAmount");
      });
    });

    describe("Unbonding", function () {
      async function bondedTokensFixture() {
        const fixture = await loadFixture(deployWithBondingCurveFixture);
        const { agentEconomics, user2, agentId } = fixture;

        // Bond tokens first
        const amount = ethers.parseEther("10");
        const [price] = await agentEconomics.getBondPrice(agentId, amount);
        await agentEconomics.connect(user2).bondTokens(agentId, amount, price + price / BigInt(10));

        return { ...fixture, bondedAmount: amount };
      }

      it("Should unbond tokens successfully", async function () {
        const { agentEconomics, mockToken, user2, agentId, bondedAmount } = await loadFixture(bondedTokensFixture);

        const unbondAmount = bondedAmount / BigInt(2); // Unbond half
        const initialBalance = await mockToken.balanceOf(user2.address);

        await expect(
          agentEconomics.connect(user2).unbondTokens(agentId, unbondAmount, 0)
        ).to.emit(agentEconomics, "TokensUnbonded");

        // Check balance increased (minus fees)
        const finalBalance = await mockToken.balanceOf(user2.address);
        expect(finalBalance).to.be.gt(initialBalance);

        // Check metrics updated
        const metrics = await agentEconomics.getEconomicMetrics(agentId);
        expect(metrics.totalBonded).to.equal(bondedAmount - unbondAmount);
      });

      it("Should apply unbonding fee", async function () {
        const { agentEconomics, mockToken, user2, agentId, bondedAmount } = await loadFixture(bondedTokensFixture);

        const unbondAmount = bondedAmount;
        const initialBalance = await mockToken.balanceOf(user2.address);

        await agentEconomics.connect(user2).unbondTokens(agentId, unbondAmount, 0);

        const finalBalance = await mockToken.balanceOf(user2.address);
        const balanceIncrease = finalBalance - initialBalance;

        // Should receive less than bonded due to fees
        expect(balanceIncrease).to.be.lt(unbondAmount);
      });
    });
  });

  describe("Staking", function () {
    async function stakingPoolFixture() {
      const fixture = await loadFixture(deployEconomicsFixture);
      const { agentEconomics, user1 } = fixture;

      // Create staking pool for agent 1
      // Note: In a real implementation, this would be done through a separate function
      // For testing, we'll simulate by directly calling stake
      return { ...fixture, agentId: 1 };
    }

    it("Should stake tokens successfully", async function () {
      const { agentEconomics, mockToken, user2, agentId } = await loadFixture(stakingPoolFixture);

      const initialBalance = await mockToken.balanceOf(user2.address);

      await expect(
        agentEconomics.connect(user2).stake(agentId, STAKING_AMOUNT, LOCK_PERIOD)
      ).to.emit(agentEconomics, "RewardDistributed");

      // Check balance decreased
      const finalBalance = await mockToken.balanceOf(user2.address);
      expect(finalBalance).to.equal(initialBalance - STAKING_AMOUNT);
    });

    it("Should fail to stake with insufficient balance", async function () {
      const { agentEconomics, user2, agentId } = await loadFixture(stakingPoolFixture);

      const excessiveAmount = ethers.parseEther("100000"); // More than user has

      await expect(
        agentEconomics.connect(user2).stake(agentId, excessiveAmount, LOCK_PERIOD)
      ).to.be.revertedWithCustomError(mockToken, "ERC20InsufficientBalance");
    });

    describe("Unstaking", function () {
      async function stakedTokensFixture() {
        const fixture = await loadFixture(stakingPoolFixture);
        const { agentEconomics, user2, agentId } = fixture;

        // Stake tokens
        await agentEconomics.connect(user2).stake(agentId, STAKING_AMOUNT, LOCK_PERIOD);

        return fixture;
      }

      it("Should fail to unstake before lock period", async function () {
        const { agentEconomics, user2 } = await loadFixture(stakedTokensFixture);

        // Try to unstake immediately
        await expect(
          agentEconomics.connect(user2).unstake(1) // stakingId
        ).to.be.revertedWithCustomError(agentEconomics, "StakingLockNotExpired");
      });

      it("Should unstake successfully after lock period", async function () {
        const { agentEconomics, mockToken, user2 } = await loadFixture(stakedTokensFixture);

        // Fast forward time past lock period
        await time.increase(LOCK_PERIOD + 1);

        const initialBalance = await mockToken.balanceOf(user2.address);

        await expect(
          agentEconomics.connect(user2).unstake(1)
        ).to.emit(agentEconomics, "RewardDistributed");

        // Check balance increased (principal + rewards)
        const finalBalance = await mockToken.balanceOf(user2.address);
        expect(finalBalance).to.be.gte(initialBalance + STAKING_AMOUNT);
      });
    });

    describe("Rewards", function () {
      async function stakedTokensFixture() {
        const fixture = await loadFixture(stakingPoolFixture);
        const { agentEconomics, user2, agentId } = fixture;

        await agentEconomics.connect(user2).stake(agentId, STAKING_AMOUNT, LOCK_PERIOD);

        return fixture;
      }

      it("Should calculate pending rewards", async function () {
        const { agentEconomics, user2, agentId } = await loadFixture(stakedTokensFixture);

        // Fast forward time to accumulate rewards
        await time.increase(86400); // 1 day

        const pendingRewards = await agentEconomics.getPendingRewards(agentId, user2.address);
        expect(pendingRewards).to.be.gt(0);
      });

      it("Should claim rewards", async function () {
        const { agentEconomics, mockToken, user2, agentId } = await loadFixture(stakedTokensFixture);

        // Fast forward time
        await time.increase(86400);

        const initialBalance = await mockToken.balanceOf(user2.address);

        await expect(
          agentEconomics.connect(user2).claimRewards(agentId)
        ).to.emit(agentEconomics, "RewardDistributed");

        const finalBalance = await mockToken.balanceOf(user2.address);
        expect(finalBalance).to.be.gt(initialBalance);
      });

      it("Should calculate staking returns correctly", async function () {
        const { agentEconomics, agentId } = await loadFixture(stakingPoolFixture);

        const amount = ethers.parseEther("100");
        const duration = 365 * 24 * 60 * 60; // 1 year

        const [expectedReward, apy] = await agentEconomics.calculateStakingReturns(agentId, amount, duration);

        expect(apy).to.be.gt(0);
        expect(expectedReward).to.be.gt(0);
      });
    });
  });

  describe("Trading", function () {
    async function tradingSetupFixture() {
      const fixture = await loadFixture(deployEconomicsFixture);
      const { agentEconomics, deployer, user1 } = fixture;

      // Grant trading manager role to deployer for testing
      const TRADING_MANAGER_ROLE = await agentEconomics.TRADING_MANAGER_ROLE();
      await agentEconomics.connect(deployer).grantRole(TRADING_MANAGER_ROLE, deployer.address);

      // Setup trading parameters
      await agentEconomics.connect(user1).setTradingParameters(
        1, // agentId
        ethers.parseEther("1000"), // maxPositionSize
        50, // riskTolerance
        [0, 1] // TradingStrategy: Conservative, Moderate
      );

      return { ...fixture, agentId: 1 };
    }

    it("Should set trading parameters", async function () {
      const { agentEconomics, user1, agentId } = await loadFixture(deployEconomicsFixture);

      await expect(
        agentEconomics.connect(user1).setTradingParameters(
          agentId,
          ethers.parseEther("1000"),
          50,
          [0, 1]
        )
      ).to.emit(agentEconomics, "TradingConfigUpdated")
        .withArgs(agentId, ethers.parseEther("1000"), 50);
    });

    it("Should execute trade successfully", async function () {
      const { agentEconomics, mockToken, deployer, agentId } = await loadFixture(tradingSetupFixture);

      const tokenIn = await mockToken.getAddress();
      const tokenOut = ethers.ZeroAddress; // ETH
      const amountIn = ethers.parseEther("10");
      const strategy = 0; // Conservative
      const slippage = 100; // 1%

      await expect(
        agentEconomics.connect(deployer).executeTrade(
          agentId,
          tokenIn,
          tokenOut,
          amountIn,
          strategy,
          slippage
        )
      ).to.emit(agentEconomics, "TradeExecuted");
    });

    it("Should fail trade with excessive slippage", async function () {
      const { agentEconomics, mockToken, deployer, agentId } = await loadFixture(tradingSetupFixture);

      const tokenIn = await mockToken.getAddress();
      const tokenOut = ethers.ZeroAddress;
      const amountIn = ethers.parseEther("10");
      const strategy = 0;
      const excessiveSlippage = 6000; // 60% (exceeds max 50%)

      await expect(
        agentEconomics.connect(deployer).executeTrade(
          agentId,
          tokenIn,
          tokenOut,
          amountIn,
          strategy,
          excessiveSlippage
        )
      ).to.be.revertedWithCustomError(agentEconomics, "InvalidSlippage");
    });

    it("Should get optimal trading route", async function () {
      const { agentEconomics, mockToken } = await loadFixture(tradingSetupFixture);

      const tokenIn = await mockToken.getAddress();
      const tokenOut = ethers.ZeroAddress;
      const amountIn = ethers.parseEther("10");

      const [route, expectedOut] = await agentEconomics.getOptimalRoute(tokenIn, tokenOut, amountIn);

      expect(route).to.have.length(2);
      expect(route[0]).to.equal(tokenIn);
      expect(route[1]).to.equal(tokenOut);
      expect(expectedOut).to.be.gt(0);
    });
  });

  describe("Economic Parameters", function () {
    it("Should update economic parameters as admin", async function () {
      const { agentEconomics, deployer } = await loadFixture(deployEconomicsFixture);

      const newFeeValue = 150; // 1.5%

      await expect(
        agentEconomics.connect(deployer).updateEconomicParameter("tradingFee", newFeeValue)
      ).to.emit(agentEconomics, "ParameterUpdated")
        .withArgs("tradingFee", 100, newFeeValue, deployer.address);

      expect(await agentEconomics.economicParameters("tradingFee")).to.equal(newFeeValue);
    });

    it("Should fail to update parameters without admin role", async function () {
      const { agentEconomics, user1 } = await loadFixture(deployEconomicsFixture);

      await expect(
        agentEconomics.connect(user1).updateEconomicParameter("tradingFee", 150)
      ).to.be.revertedWith("AccessControl:");
    });

    it("Should pause and resume trading", async function () {
      const { agentEconomics, deployer } = await loadFixture(deployEconomicsFixture);

      // Pause all trading
      await agentEconomics.connect(deployer).pauseTrading(0);

      // Resume all trading
      await agentEconomics.connect(deployer).resumeTrading(0);
    });

    it("Should pause and resume specific agent trading", async function () {
      const { agentEconomics, deployer } = await loadFixture(deployEconomicsFixture);

      const agentId = 1;

      // Pause specific agent trading
      await agentEconomics.connect(deployer).pauseTrading(agentId);

      // Resume specific agent trading
      await agentEconomics.connect(deployer).resumeTrading(agentId);
    });
  });

  describe("Analytics", function () {
    it("Should get market statistics", async function () {
      const { agentEconomics } = await loadFixture(deployEconomicsFixture);

      const [totalMarketCap, totalVolume24h, activeTraders] = await agentEconomics.getMarketStats();

      expect(totalMarketCap).to.be.gt(0);
      expect(totalVolume24h).to.be.gt(0);
      expect(activeTraders).to.be.gt(0);
    });

    it("Should get top performers", async function () {
      const { agentEconomics } = await loadFixture(deployEconomicsFixture);

      const [agentIds, values] = await agentEconomics.getTopPerformers("marketCap", 5);

      expect(agentIds).to.have.length(5);
      expect(values).to.have.length(5);
      expect(values[0]).to.be.gt(0);
    });

    it("Should get economic metrics for agent", async function () {
      const { agentEconomics } = await loadFixture(deployWithBondingCurveFixture);

      const metrics = await agentEconomics.getEconomicMetrics(1);

      expect(metrics.totalBonded).to.equal(0); // No tokens bonded yet
      expect(metrics.lastUpdated).to.be.gt(0);
    });
  });

  describe("Liquidity Management", function () {
    it("Should create liquidity pool", async function () {
      const { agentEconomics, mockToken, user1 } = await loadFixture(deployEconomicsFixture);

      const tokenA = await mockToken.getAddress();
      const tokenB = ethers.ZeroAddress;
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("1");

      await expect(
        agentEconomics.connect(user1).createLiquidityPool(1, tokenA, tokenB, amountA, amountB)
      ).to.emit(agentEconomics, "PoolCreated");
    });

    it("Should add liquidity to pool", async function () {
      const { agentEconomics, mockToken, user1 } = await loadFixture(deployEconomicsFixture);

      // First create a pool
      const tokenA = await mockToken.getAddress();
      const tokenB = ethers.ZeroAddress;

      const poolAddress = await agentEconomics.connect(user1).createLiquidityPool.staticCall(
        1, tokenA, tokenB, ethers.parseEther("100"), ethers.parseEther("1")
      );

      await agentEconomics.connect(user1).createLiquidityPool(
        1, tokenA, tokenB, ethers.parseEther("100"), ethers.parseEther("1")
      );

      // Add liquidity
      const liquidity = await agentEconomics.connect(user1).addLiquidity(
        1, poolAddress, ethers.parseEther("50"), ethers.parseEther("0.5")
      );

      expect(liquidity).to.be.gt(0);
    });
  });

  describe("Access Control", function () {
    it("Should fail operations without proper authorization", async function () {
      const { agentEconomics, user2 } = await loadFixture(deployEconomicsFixture);

      // Try to configure bonding curve without owning agent
      const bondingCurve = {
        curveType: 0,
        basePrice: BASE_PRICE,
        priceMultiplier: PRICE_MULTIPLIER,
        maxSupply: MAX_SUPPLY,
        currentSupply: 0,
        reserveRatio: 500000,
        curveParameters: "0x"
      };

      await expect(
        agentEconomics.connect(user2).configureBondingCurve(1, bondingCurve)
      ).to.be.revertedWith("Not authorized for agent");
    });

    it("Should allow operations with proper roles", async function () {
      const { agentEconomics, deployer } = await loadFixture(deployEconomicsFixture);

      // Admin should be able to update parameters
      await expect(
        agentEconomics.connect(deployer).updateEconomicParameter("tradingFee", 200)
      ).to.emit(agentEconomics, "ParameterUpdated");
    });
  });

  describe("Edge Cases and Error Handling", function () {
    it("Should handle zero amounts gracefully", async function () {
      const { agentEconomics } = await loadFixture(deployWithBondingCurveFixture);

      // Should fail with zero bonding amount
      await expect(
        agentEconomics.getBondPrice(1, 0)
      ).to.not.be.reverted; // Price calculation should work

      // But bonding should fail
      await expect(
        agentEconomics.connect(await ethers.provider.getSigner()).bondTokens(1, 0, 0)
      ).to.be.revertedWithCustomError(agentEconomics, "InvalidBondingAmount");
    });

    it("Should handle non-existent agents", async function () {
      const { agentEconomics } = await loadFixture(deployEconomicsFixture);

      await expect(
        agentEconomics.getBondPrice(999, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(agentEconomics, "AgentNotFound");
    });

    it("Should handle contract being paused", async function () {
      const { agentEconomics, deployer, user2 } = await loadFixture(deployWithBondingCurveFixture);

      // Pause contract
      await agentEconomics.connect(deployer).pause();

      // Operations should fail when paused
      await expect(
        agentEconomics.connect(user2).bondTokens(1, ethers.parseEther("1"), ethers.parseEther("1"))
      ).to.be.revertedWith("Pausable: paused");

      // Unpause and operations should work again
      await agentEconomics.connect(deployer).unpause();

      const amount = ethers.parseEther("1");
      const [price] = await agentEconomics.getBondPrice(1, amount);

      await expect(
        agentEconomics.connect(user2).bondTokens(1, amount, price + price / BigInt(10))
      ).to.emit(agentEconomics, "TokensBonded");
    });
  });
});