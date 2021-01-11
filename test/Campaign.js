const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

const MIN_CONTRIBUTION_IN_WEI = "100";

describe("Campaign", () => {
  let CampaignFactory;
  let campaignFactory;
  let campaign;
  let campaignAsOwner;
  let owner;
  let signer1;
  let signer2;
  let signers;

  beforeEach(async () => {
    CampaignFactory = await ethers.getContractFactory("CampaignFactory");
    [owner, signer1, signer2, ...signers] = await ethers.getSigners();

    campaignFactory = await CampaignFactory.deploy();

    // deploy a campaign
    const tx = await campaignFactory.createCampaign(MIN_CONTRIBUTION_IN_WEI);
    await tx.wait();

    [campaignAddress] = await campaignFactory.getDeployedCampaigns();
    campaign = await ethers.getContractAt("Campaign", campaignAddress);

    campaignAsOwner = campaign.connect(owner);
  });

  it("should deploy a factory and a campaign", () => {
    expect(campaignFactory.address).to.exist;
    expect(campaign.address).to.exist;
  });

  it("should assign the proper address as campaign manager", async () => {
    const manager = await campaign.manager();

    expect(manager).to.equal(owner.address);
  });

  describe("contribute", () => {
    it("should mark contributors as such", async () => {
      await campaign.connect(signer1).contribute({ value: 200 });

      const isContributor = await campaign.isAContributor(signer1.address);
      expect(isContributor).to.be.true;
    });

    it("should increase the contributor count", async () => {
      await campaign.connect(signer1).contribute({ value: 200 });

      const contributorCount = await campaign.contributorCount();
      expect(contributorCount).to.equal(1);
    });

    it("should increase the contributor count with different contributors", async () => {
      await campaign.connect(signer1).contribute({ value: 200 });
      await campaign.connect(signer2).contribute({ value: 200 });

      const contributorCount = await campaign.contributorCount();
      expect(contributorCount).to.equal(2);
    });

    it("should not double count contributors", async () => {
      await campaign.connect(signer1).contribute({ value: 200 });
      await campaign.connect(signer1).contribute({ value: 300 });

      const contributorCount = await campaign.contributorCount();
      expect(contributorCount).to.equal(1);
    });

    it("should require a minimum contribution", async () => {
      await expect(campaign.connect(signer1).contribute({ value: 1 })).to.be
        .reverted;
    });
  });

  describe("createRequest", () => {
    it("should only allow the manager to create a request", async () => {
      await expect(
        campaign.connect(signer1).createRequest("A", "100", signer1.address)
      ).to.be.reverted;
    });

    it("should allow a manager to create a request and initialize properly", async () => {
      const mockRequestDescription = "Buy furnitures";
      const mockValue = "100";
      const mockRecipient = signer1.address;

      await campaign
        .connect(owner)
        .createRequest(mockRequestDescription, mockValue, mockRecipient);

      const request = await campaign.requests(0);

      expect(request.description).to.equal(mockRequestDescription);
      expect(request.value).to.equal(mockValue);
      expect(request.recipient).to.equal(mockRecipient);
      expect(request.complete).to.be.false;
      expect(request.approvalCount).to.equal(0);
    });

    it("should increment the numberOfRequests", async () => {
      await campaign.connect(owner).createRequest("A", "100", signer1.address);
      await campaign.connect(owner).createRequest("B", "200", signer1.address);

      const numberOfRequests = await campaign.numberOfRequests();

      expect(numberOfRequests).to.equal(2);
    });
  });

  describe("approveRequest", () => {
    let request;
    beforeEach(async () => {
      await campaignAsOwner.createRequest("Buy laptop", "42", signer1.address);

      request = await campaign.requests(0);
      expect(request.approvalCount).to.equal(0);
    });

    it("should let contributors approve a request and increase approvalCount", async () => {
      await campaignAsOwner.contribute({ value: 200 });
      await campaignAsOwner.approveRequest(0);

      const request = await campaign.requests(0);
      const approvalCount = request.approvalCount.toNumber();

      expect(approvalCount).to.equal(1);
    });

    it("should not let an address approve twice", async () => {
      await campaignAsOwner.contribute({ value: 200 });

      await campaignAsOwner.approveRequest(0);
      await expect(campaignAsOwner.approveRequest(0)).to.be.reverted;
    });

    it("should require to be a contributor to approve", async () => {
      await expect(campaign.connect(signer2).approveRequest(0)).to.be.reverted;
    });
  });

  describe("finalizeRequest", () => {
    let recipientStartingBalance;
    const contributionInWei = ethers.utils.parseEther("3");
    const requestValueInWei = ethers.utils.parseEther("1");

    beforeEach(async () => {
      recipientStartingBalance = await signer1.getBalance();

      await campaignAsOwner.contribute({ value: contributionInWei });

      await campaignAsOwner.createRequest(
        "Buy laptop",
        requestValueInWei,
        signer1.address
      );

      await campaignAsOwner.approveRequest(0);
    });

    it("should process requests successfully", async () => {
      await campaignAsOwner.finalizeRequest(0);

      const finalBalance = await signer1.getBalance();

      expect(finalBalance).to.equal(
        recipientStartingBalance.add(requestValueInWei)
      );

      const request = await campaign.requests(0);
      expect(request.complete).to.be.true;
    });

    it("should not let an already complete request be finalized", async () => {
      await campaignAsOwner.finalizeRequest(0);

      await expect(campaignAsOwner.finalizeRequest(0)).to.be.revertedWith(
        "request already completed"
      );
    });

    it("should not allow a request without a majority of approvals to be finalized", async () => {
      await campaign.connect(signer1).contribute({ value: contributionInWei });

      // 2 contributors but only 1 approval from owner
      await expect(campaignAsOwner.finalizeRequest(0)).to.be.revertedWith(
        "not enough approvals"
      );
    });
  });

  describe("getSummary", () => {
    it("should return the right information", async () => {
      const mockRequestDescription = "Buy furnitures";
      const mockValue = "100";
      const mockRecipient = signer1.address;

      const expectedMinContribution = BigNumber.from(MIN_CONTRIBUTION_IN_WEI);
      const expectedBalance = BigNumber.from(0);
      const expectedNumberOfRequests = BigNumber.from(1);
      const expectedApproverCount = BigNumber.from(0);

      // create a request
      await campaign
        .connect(owner)
        .createRequest(mockRequestDescription, mockValue, mockRecipient);

      const summary = await campaign.getSummary();
      expect(summary[0]).to.equal(expectedMinContribution);
      expect(summary[1]).to.equal(expectedBalance);
      expect(summary[2]).to.equal(expectedNumberOfRequests);
      expect(summary[3]).to.equal(expectedApproverCount);
      expect(summary[4]).to.equal(owner.address);
    });
  });
});
