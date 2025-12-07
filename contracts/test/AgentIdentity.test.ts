import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("AgentIdentity", function () {
  // Test constants
  const AGENT_TYPE = "researcher";
  const CAPABILITIES = ["analysis", "research", "reporting"];
  const METADATA_HASH = ethers.keccak256(ethers.toUtf8Bytes("test metadata"));
  const MAX_AGENTS_PER_OWNER = 100;
  const MAX_CAPABILITIES = 50;
  const MIN_REPUTATION = -1000;
  const MAX_REPUTATION = 1000;

  // Role constants
  let DEFAULT_ADMIN_ROLE: string;
  let MINTER_ROLE: string;
  let CONTROLLER_ROLE: string;
  let REPUTATION_MANAGER_ROLE: string;

  async function deployAgentIdentityFixture() {
    // Get signers
    const [deployer, minter, controller, user1, user2, user3] = await ethers.getSigners();

    // Deploy contract
    const AgentIdentity = await ethers.getContractFactory("AgentIdentity");
    const agentIdentity = await AgentIdentity.deploy(
      deployer.address,
      minter.address,
      controller.address
    );

    await agentIdentity.waitForDeployment();

    // Get role constants
    DEFAULT_ADMIN_ROLE = await agentIdentity.DEFAULT_ADMIN_ROLE();
    MINTER_ROLE = await agentIdentity.MINTER_ROLE();
    CONTROLLER_ROLE = await agentIdentity.CONTROLLER_ROLE();
    REPUTATION_MANAGER_ROLE = await agentIdentity.REPUTATION_MANAGER_ROLE();

    return {
      agentIdentity,
      deployer,
      minter,
      controller,
      user1,
      user2,
      user3
    };
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial parameters", async function () {
      const { agentIdentity, deployer, minter, controller } = await loadFixture(deployAgentIdentityFixture);

      expect(await agentIdentity.name()).to.equal("AETERNA Agent Identity");
      expect(await agentIdentity.symbol()).to.equal("AGENT");
      expect(await agentIdentity.getTotalAgents()).to.equal(0);

      // Check role assignments
      expect(await agentIdentity.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.true;
      expect(await agentIdentity.hasRole(MINTER_ROLE, minter.address)).to.be.true;
      expect(await agentIdentity.hasRole(CONTROLLER_ROLE, controller.address)).to.be.true;
      expect(await agentIdentity.hasRole(REPUTATION_MANAGER_ROLE, controller.address)).to.be.true;
    });

    it("Should have correct constants", async function () {
      const { agentIdentity } = await loadFixture(deployAgentIdentityFixture);

      expect(await agentIdentity.MAX_CAPABILITIES()).to.equal(MAX_CAPABILITIES);
      expect(await agentIdentity.MAX_AGENTS_PER_OWNER()).to.equal(MAX_AGENTS_PER_OWNER);
      expect(await agentIdentity.MIN_REPUTATION()).to.equal(MIN_REPUTATION);
      expect(await agentIdentity.MAX_REPUTATION()).to.equal(MAX_REPUTATION);
    });
  });

  describe("Agent Creation", function () {
    it("Should create an agent successfully", async function () {
      const { agentIdentity, user1 } = await loadFixture(deployAgentIdentityFixture);

      await expect(
        agentIdentity.connect(user1).createAgent(AGENT_TYPE, CAPABILITIES, METADATA_HASH)
      ).to.emit(agentIdentity, "AgentCreated")
        .withArgs(1, user1.address, AGENT_TYPE, CAPABILITIES);

      // Check agent was created correctly
      const agentInfo = await agentIdentity.getAgentInfo(1);
      expect(agentInfo.id).to.equal(1);
      expect(agentInfo.owner).to.equal(user1.address);
      expect(agentInfo.agentType).to.equal(AGENT_TYPE);
      expect(agentInfo.status).to.equal(1); // Active status
      expect(agentInfo.trustLevel).to.equal(0); // Untrusted initially
      expect(agentInfo.reputation).to.equal(0);
      expect(agentInfo.metadataHash).to.equal(METADATA_HASH);
      expect(agentInfo.capabilities).to.deep.equal(CAPABILITIES);

      // Check NFT was minted
      expect(await agentIdentity.ownerOf(1)).to.equal(user1.address);
      expect(await agentIdentity.getTotalAgents()).to.equal(1);
    });

    it("Should create agent with minter role", async function () {
      const { agentIdentity, minter, user1 } = await loadFixture(deployAgentIdentityFixture);

      await expect(
        agentIdentity.connect(minter).createAgentFor(
          user1.address,
          AGENT_TYPE,
          CAPABILITIES,
          METADATA_HASH
        )
      ).to.emit(agentIdentity, "AgentCreated")
        .withArgs(1, user1.address, AGENT_TYPE, CAPABILITIES);

      expect(await agentIdentity.ownerOf(1)).to.equal(user1.address);
    });

    it("Should fail when creating agent with too many capabilities", async function () {
      const { agentIdentity, user1 } = await loadFixture(deployAgentIdentityFixture);

      const tooManyCapabilities = Array(MAX_CAPABILITIES + 1).fill("capability");

      await expect(
        agentIdentity.connect(user1).createAgent(AGENT_TYPE, tooManyCapabilities, METADATA_HASH)
      ).to.be.revertedWithCustomError(agentIdentity, "MaxCapabilitiesExceeded");
    });

    it("Should fail when creating agent with empty capability", async function () {
      const { agentIdentity, user1 } = await loadFixture(deployAgentIdentityFixture);

      const capabilitiesWithEmpty = ["valid", "", "another"];

      await expect(
        agentIdentity.connect(user1).createAgent(AGENT_TYPE, capabilitiesWithEmpty, METADATA_HASH)
      ).to.be.revertedWithCustomError(agentIdentity, "EmptyCapabilityString");
    });

    it("Should create multiple agents for same owner", async function () {
      const { agentIdentity, user1 } = await loadFixture(deployAgentIdentityFixture);

      // Create first agent
      await agentIdentity.connect(user1).createAgent(AGENT_TYPE, CAPABILITIES, METADATA_HASH);

      // Create second agent
      await agentIdentity.connect(user1).createAgent("trader", ["trading"], METADATA_HASH);

      expect(await agentIdentity.balanceOf(user1.address)).to.equal(2);
      expect(await agentIdentity.getTotalAgents()).to.equal(2);

      const ownerAgents = await agentIdentity.getAgentsByOwner(user1.address);
      expect(ownerAgents).to.have.length(2);
      expect(ownerAgents[0]).to.equal(1);
      expect(ownerAgents[1]).to.equal(2);
    });

    it("Should batch create agents", async function () {
      const { agentIdentity, minter } = await loadFixture(deployAgentIdentityFixture);

      const agentTypes = ["researcher", "trader", "analyst"];
      const capabilities = [["research"], ["trading"], ["analysis"]];
      const metadataHashes = [METADATA_HASH, METADATA_HASH, METADATA_HASH];

      await expect(
        agentIdentity.connect(minter).batchCreateAgents(agentTypes, capabilities, metadataHashes)
      ).to.emit(agentIdentity, "BatchAgentsCreated")
        .withArgs([1, 2, 3], minter.address, 3);

      expect(await agentIdentity.getTotalAgents()).to.equal(3);
      expect(await agentIdentity.balanceOf(minter.address)).to.equal(3);
    });
  });

  describe("Capability Management", function () {
    async function createAgentFixture() {
      const fixture = await loadFixture(deployAgentIdentityFixture);
      const { agentIdentity, user1 } = fixture;

      await agentIdentity.connect(user1).createAgent(AGENT_TYPE, CAPABILITIES, METADATA_HASH);

      return { ...fixture, agentId: 1 };
    }

    it("Should update capabilities as owner", async function () {
      const { agentIdentity, user1, agentId } = await loadFixture(createAgentFixture);

      const newCapabilities = ["new_analysis", "advanced_research"];

      await expect(
        agentIdentity.connect(user1).updateCapabilities(agentId, newCapabilities)
      ).to.emit(agentIdentity, "CapabilitiesUpdated")
        .withArgs(agentId, newCapabilities, user1.address);

      const agentInfo = await agentIdentity.getAgentInfo(agentId);
      expect(agentInfo.capabilities).to.deep.equal(newCapabilities);

      // Check individual capabilities
      expect(await agentIdentity.hasCapability(agentId, "new_analysis")).to.be.true;
      expect(await agentIdentity.hasCapability(agentId, "advanced_research")).to.be.true;
      expect(await agentIdentity.hasCapability(agentId, "analysis")).to.be.false; // Old capability removed
    });

    it("Should update capabilities as controller", async function () {
      const { agentIdentity, controller, agentId } = await loadFixture(createAgentFixture);

      const newCapabilities = ["controller_capability"];

      await expect(
        agentIdentity.connect(controller).updateCapabilities(agentId, newCapabilities)
      ).to.emit(agentIdentity, "CapabilitiesUpdated");

      const agentInfo = await agentIdentity.getAgentInfo(agentId);
      expect(agentInfo.capabilities).to.deep.equal(newCapabilities);
    });

    it("Should fail to update capabilities as unauthorized user", async function () {
      const { agentIdentity, user2, agentId } = await loadFixture(createAgentFixture);

      await expect(
        agentIdentity.connect(user2).updateCapabilities(agentId, ["unauthorized"])
      ).to.be.revertedWithCustomError(agentIdentity, "Unauthorized");
    });

    it("Should check capabilities correctly", async function () {
      const { agentIdentity, agentId } = await loadFixture(createAgentFixture);

      expect(await agentIdentity.hasCapability(agentId, "analysis")).to.be.true;
      expect(await agentIdentity.hasCapability(agentId, "research")).to.be.true;
      expect(await agentIdentity.hasCapability(agentId, "nonexistent")).to.be.false;
    });
  });

  describe("Status Management", function () {
    async function createAgentFixture() {
      const fixture = await loadFixture(deployAgentIdentityFixture);
      const { agentIdentity, user1 } = fixture;

      await agentIdentity.connect(user1).createAgent(AGENT_TYPE, CAPABILITIES, METADATA_HASH);

      return { ...fixture, agentId: 1 };
    }

    it("Should change agent status as owner", async function () {
      const { agentIdentity, user1, agentId } = await loadFixture(createAgentFixture);

      await expect(
        agentIdentity.connect(user1).changeStatus(agentId, 2, "Suspending for maintenance") // Suspended
      ).to.emit(agentIdentity, "StatusChanged")
        .withArgs(agentId, 1, 2, "Suspending for maintenance"); // Active to Suspended

      const agentInfo = await agentIdentity.getAgentInfo(agentId);
      expect(agentInfo.status).to.equal(2); // Suspended

      expect(await agentIdentity.isActive(agentId)).to.be.false;
    });

    it("Should change agent status as controller", async function () {
      const { agentIdentity, controller, agentId } = await loadFixture(createAgentFixture);

      await agentIdentity.connect(controller).changeStatus(agentId, 3, "Retiring agent"); // Retired

      const agentInfo = await agentIdentity.getAgentInfo(agentId);
      expect(agentInfo.status).to.equal(3); // Retired
    });

    it("Should fail to change status from retired", async function () {
      const { agentIdentity, user1, agentId } = await loadFixture(createAgentFixture);

      // First retire the agent
      await agentIdentity.connect(user1).changeStatus(agentId, 3, "Retiring"); // Retired

      // Try to change status from retired (should fail)
      await expect(
        agentIdentity.connect(user1).changeStatus(agentId, 1, "Trying to reactivate") // Active
      ).to.be.revertedWithCustomError(agentIdentity, "InvalidAgentStatus");
    });

    it("Should fail to change to same status", async function () {
      const { agentIdentity, user1, agentId } = await loadFixture(createAgentFixture);

      await expect(
        agentIdentity.connect(user1).changeStatus(agentId, 1, "Same status") // Already Active
      ).to.be.revertedWithCustomError(agentIdentity, "InvalidAgentStatus");
    });
  });

  describe("Reputation Management", function () {
    async function createAgentFixture() {
      const fixture = await loadFixture(deployAgentIdentityFixture);
      const { agentIdentity, user1 } = fixture;

      await agentIdentity.connect(user1).createAgent(AGENT_TYPE, CAPABILITIES, METADATA_HASH);

      return { ...fixture, agentId: 1 };
    }

    it("Should update reputation as reputation manager", async function () {
      const { agentIdentity, controller, agentId } = await loadFixture(createAgentFixture);

      await expect(
        agentIdentity.connect(controller).updateReputation(agentId, 100, "Good performance")
      ).to.emit(agentIdentity, "ReputationUpdated")
        .withArgs(agentId, 0, 100, "Good performance");

      expect(await agentIdentity.getReputation(agentId)).to.equal(100);
    });

    it("Should handle negative reputation changes", async function () {
      const { agentIdentity, controller, agentId } = await loadFixture(createAgentFixture);

      await agentIdentity.connect(controller).updateReputation(agentId, -50, "Poor performance");

      expect(await agentIdentity.getReputation(agentId)).to.equal(-50);
    });

    it("Should clamp reputation to valid range", async function () {
      const { agentIdentity, controller, agentId } = await loadFixture(createAgentFixture);

      // Try to exceed max reputation
      await agentIdentity.connect(controller).updateReputation(agentId, 2000, "Exceeding max");
      expect(await agentIdentity.getReputation(agentId)).to.equal(MAX_REPUTATION);

      // Try to go below min reputation
      await agentIdentity.connect(controller).updateReputation(agentId, -3000, "Below min");
      expect(await agentIdentity.getReputation(agentId)).to.equal(MIN_REPUTATION);
    });

    it("Should fail to update reputation as unauthorized user", async function () {
      const { agentIdentity, user2, agentId } = await loadFixture(createAgentFixture);

      await expect(
        agentIdentity.connect(user2).updateReputation(agentId, 100, "Unauthorized")
      ).to.be.revertedWith("AccessControl:");
    });
  });

  describe("Action Recording", function () {
    async function createAgentFixture() {
      const fixture = await loadFixture(deployAgentIdentityFixture);
      const { agentIdentity, user1 } = fixture;

      await agentIdentity.connect(user1).createAgent(AGENT_TYPE, CAPABILITIES, METADATA_HASH);

      return { ...fixture, agentId: 1 };
    }

    it("Should record successful action as controller", async function () {
      const { agentIdentity, controller, agentId } = await loadFixture(createAgentFixture);

      const actionType = "research_task";
      const target = ethers.ZeroAddress;
      const data = ethers.toUtf8Bytes("action data");

      await expect(
        agentIdentity.connect(controller).recordAction(agentId, actionType, target, data, true)
      ).to.emit(agentIdentity, "ActionPerformed");

      const agentInfo = await agentIdentity.getAgentInfo(agentId);
      expect(agentInfo.actionsPerformed).to.equal(1);
      expect(agentInfo.successfulActions).to.equal(1);
    });

    it("Should record failed action", async function () {
      const { agentIdentity, controller, agentId } = await loadFixture(createAgentFixture);

      await agentIdentity.connect(controller).recordAction(
        agentId,
        "failed_task",
        ethers.ZeroAddress,
        "0x",
        false
      );

      const agentInfo = await agentIdentity.getAgentInfo(agentId);
      expect(agentInfo.actionsPerformed).to.equal(1);
      expect(agentInfo.successfulActions).to.equal(0);
    });

    it("Should update lastActive timestamp on action", async function () {
      const { agentIdentity, controller, agentId } = await loadFixture(createAgentFixture);

      const initialInfo = await agentIdentity.getAgentInfo(agentId);
      const initialLastActive = initialInfo.lastActive;

      // Wait a bit and record action
      await new Promise(resolve => setTimeout(resolve, 1000));

      await agentIdentity.connect(controller).recordAction(
        agentId,
        "test_action",
        ethers.ZeroAddress,
        "0x",
        true
      );

      const updatedInfo = await agentIdentity.getAgentInfo(agentId);
      expect(updatedInfo.lastActive).to.be.gt(initialLastActive);
    });
  });

  describe("Authorization", function () {
    async function createAgentFixture() {
      const fixture = await loadFixture(deployAgentIdentityFixture);
      const { agentIdentity, user1 } = fixture;

      await agentIdentity.connect(user1).createAgent(AGENT_TYPE, CAPABILITIES, METADATA_HASH);

      return { ...fixture, agentId: 1 };
    }

    it("Should authorize operator", async function () {
      const { agentIdentity, user1, user2, agentId } = await loadFixture(createAgentFixture);

      await agentIdentity.connect(user1).authorize(agentId, user2.address);

      expect(await agentIdentity.isAuthorized(agentId, user2.address)).to.be.true;
    });

    it("Should revoke authorization", async function () {
      const { agentIdentity, user1, user2, agentId } = await loadFixture(createAgentFixture);

      await agentIdentity.connect(user1).authorize(agentId, user2.address);
      expect(await agentIdentity.isAuthorized(agentId, user2.address)).to.be.true;

      await agentIdentity.connect(user1).revoke(agentId, user2.address);
      expect(await agentIdentity.isAuthorized(agentId, user2.address)).to.be.false;
    });

    it("Should check owner authorization", async function () {
      const { agentIdentity, user1, agentId } = await loadFixture(createAgentFixture);

      expect(await agentIdentity.isAuthorized(agentId, user1.address)).to.be.true;
    });

    it("Should check controller role authorization", async function () {
      const { agentIdentity, controller, agentId } = await loadFixture(createAgentFixture);

      expect(await agentIdentity.isAuthorized(agentId, controller.address)).to.be.true;
    });
  });

  describe("Querying Functions", function () {
    async function createMultipleAgentsFixture() {
      const fixture = await loadFixture(deployAgentIdentityFixture);
      const { agentIdentity, user1, user2 } = fixture;

      // Create agents for user1
      await agentIdentity.connect(user1).createAgent("researcher", ["research"], METADATA_HASH);
      await agentIdentity.connect(user1).createAgent("trader", ["trading"], METADATA_HASH);

      // Create agent for user2
      await agentIdentity.connect(user2).createAgent("analyst", ["analysis"], METADATA_HASH);

      return fixture;
    }

    it("Should get agents by owner", async function () {
      const { agentIdentity, user1, user2 } = await loadFixture(createMultipleAgentsFixture);

      const user1Agents = await agentIdentity.getAgentsByOwner(user1.address);
      const user2Agents = await agentIdentity.getAgentsByOwner(user2.address);

      expect(user1Agents).to.have.length(2);
      expect(user1Agents[0]).to.equal(1);
      expect(user1Agents[1]).to.equal(2);

      expect(user2Agents).to.have.length(1);
      expect(user2Agents[0]).to.equal(3);
    });

    it("Should get agents by type", async function () {
      const { agentIdentity } = await loadFixture(createMultipleAgentsFixture);

      const researcherAgents = await agentIdentity.getAgentsByType("researcher");
      const traderAgents = await agentIdentity.getAgentsByType("trader");

      expect(researcherAgents).to.have.length(1);
      expect(researcherAgents[0]).to.equal(1);

      expect(traderAgents).to.have.length(1);
      expect(traderAgents[0]).to.equal(2);
    });

    it("Should get global statistics", async function () {
      const { agentIdentity } = await loadFixture(createMultipleAgentsFixture);

      const [totalAgents, activeAgents, retiredAgents, averageReputation] =
        await agentIdentity.getGlobalStats();

      expect(totalAgents).to.equal(3);
      expect(activeAgents).to.equal(3);
      expect(retiredAgents).to.equal(0);
    });
  });

  describe("NFT Transfer", function () {
    async function createAgentFixture() {
      const fixture = await loadFixture(deployAgentIdentityFixture);
      const { agentIdentity, user1 } = fixture;

      await agentIdentity.connect(user1).createAgent(AGENT_TYPE, CAPABILITIES, METADATA_HASH);

      return { ...fixture, agentId: 1 };
    }

    it("Should transfer agent NFT", async function () {
      const { agentIdentity, user1, user2, agentId } = await loadFixture(createAgentFixture);

      await expect(
        agentIdentity.connect(user1).transferFrom(user1.address, user2.address, agentId)
      ).to.emit(agentIdentity, "AgentTransferred")
        .withArgs(agentId, user1.address, user2.address, await ethers.provider.getBlock('latest').then(b => b!.timestamp + 1));

      expect(await agentIdentity.ownerOf(agentId)).to.equal(user2.address);

      // Check ownership mappings updated
      const user1Agents = await agentIdentity.getAgentsByOwner(user1.address);
      const user2Agents = await agentIdentity.getAgentsByOwner(user2.address);

      expect(user1Agents).to.have.length(0);
      expect(user2Agents).to.have.length(1);
      expect(user2Agents[0]).to.equal(agentId);

      // Check agent info updated
      const agentInfo = await agentIdentity.getAgentInfo(agentId);
      expect(agentInfo.owner).to.equal(user2.address);
    });
  });

  describe("Access Control", function () {
    it("Should have correct default admin", async function () {
      const { agentIdentity, deployer } = await loadFixture(deployAgentIdentityFixture);

      expect(await agentIdentity.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.true;
    });

    it("Should grant and revoke roles", async function () {
      const { agentIdentity, deployer, user1 } = await loadFixture(deployAgentIdentityFixture);

      // Grant minter role
      await agentIdentity.connect(deployer).grantRole(MINTER_ROLE, user1.address);
      expect(await agentIdentity.hasRole(MINTER_ROLE, user1.address)).to.be.true;

      // Revoke minter role
      await agentIdentity.connect(deployer).revokeRole(MINTER_ROLE, user1.address);
      expect(await agentIdentity.hasRole(MINTER_ROLE, user1.address)).to.be.false;
    });

    it("Should fail to grant role without admin", async function () {
      const { agentIdentity, user1, user2 } = await loadFixture(deployAgentIdentityFixture);

      await expect(
        agentIdentity.connect(user1).grantRole(MINTER_ROLE, user2.address)
      ).to.be.revertedWith("AccessControl:");
    });
  });

  describe("Pausable", function () {
    it("Should pause and unpause contract", async function () {
      const { agentIdentity, deployer, user1 } = await loadFixture(deployAgentIdentityFixture);

      // Pause contract
      await agentIdentity.connect(deployer).pause();
      expect(await agentIdentity.paused()).to.be.true;

      // Should fail to create agent when paused
      await expect(
        agentIdentity.connect(user1).createAgent(AGENT_TYPE, CAPABILITIES, METADATA_HASH)
      ).to.be.revertedWith("Pausable: paused");

      // Unpause contract
      await agentIdentity.connect(deployer).unpause();
      expect(await agentIdentity.paused()).to.be.false;

      // Should work again after unpause
      await expect(
        agentIdentity.connect(user1).createAgent(AGENT_TYPE, CAPABILITIES, METADATA_HASH)
      ).to.emit(agentIdentity, "AgentCreated");
    });

    it("Should fail to pause without admin role", async function () {
      const { agentIdentity, user1 } = await loadFixture(deployAgentIdentityFixture);

      await expect(
        agentIdentity.connect(user1).pause()
      ).to.be.revertedWith("AccessControl:");
    });
  });

  describe("ERC165 Interface Support", function () {
    it("Should support expected interfaces", async function () {
      const { agentIdentity } = await loadFixture(deployAgentIdentityFixture);

      // ERC721
      expect(await agentIdentity.supportsInterface("0x80ac58cd")).to.be.true;

      // ERC721Metadata
      expect(await agentIdentity.supportsInterface("0x5b5e139f")).to.be.true;

      // ERC721Enumerable
      expect(await agentIdentity.supportsInterface("0x780e9d63")).to.be.true;

      // AccessControl
      expect(await agentIdentity.supportsInterface("0x7965db0b")).to.be.true;
    });
  });

  describe("Edge Cases", function () {
    it("Should handle agent not found error", async function () {
      const { agentIdentity } = await loadFixture(deployAgentIdentityFixture);

      await expect(
        agentIdentity.getAgentInfo(999)
      ).to.be.revertedWithCustomError(agentIdentity, "AgentNotFound");
    });

    it("Should handle empty arrays correctly", async function () {
      const { agentIdentity, user1 } = await loadFixture(deployAgentIdentityFixture);

      const emptyAgents = await agentIdentity.getAgentsByOwner(user1.address);
      expect(emptyAgents).to.have.length(0);

      const emptyType = await agentIdentity.getAgentsByType("nonexistent");
      expect(emptyType).to.have.length(0);
    });

    it("Should handle large number of agents", async function () {
      const { agentIdentity, user1 } = await loadFixture(deployAgentIdentityFixture);

      // Create multiple agents
      const numAgents = 10;
      for (let i = 0; i < numAgents; i++) {
        await agentIdentity.connect(user1).createAgent(
          `agent_${i}`,
          [`capability_${i}`],
          METADATA_HASH
        );
      }

      expect(await agentIdentity.getTotalAgents()).to.equal(numAgents);
      expect(await agentIdentity.balanceOf(user1.address)).to.equal(numAgents);

      const ownerAgents = await agentIdentity.getAgentsByOwner(user1.address);
      expect(ownerAgents).to.have.length(numAgents);
    });
  });
});