pragma solidity ^0.7.3;

contract CampaignFactory {
    address[] public deployedCampaigns;
    
    function createCampaign(uint minimumContribution) public {
        address newCampaign = address(new Campaign(minimumContribution, msg.sender));
        
        deployedCampaigns.push(newCampaign);
    }
    
    function getDeployedCampaigns() public view returns (address[] memory) {
        return deployedCampaigns;
    }
}


contract Campaign {
    struct Request {
        string description;
        address payable recipient;
        uint value;
        bool complete;
        uint approvalCount;
        mapping(address => bool) approvals;
    }
    uint public numberOfRequests;
    mapping (uint => Request) public requests;
    address public manager;
    uint public minimumContribution;
    mapping(address => bool) public isAContributor;
    uint public contributorCount;
    
    modifier restricted() {
        require(msg.sender == manager);
        _;
    }
    
    constructor (uint minimum, address creator) {
        manager = creator;
        minimumContribution = minimum;
    }
    
    function contribute() public payable {
        require(msg.value > minimumContribution);
        
        if(!isAContributor[msg.sender]) {
          contributorCount++;
        }

        isAContributor[msg.sender] = true;
    }
    
    function createRequest(string calldata description, uint value, address payable recipient)
    public restricted {
        Request storage r = requests[numberOfRequests];
        r.description = description;
        r.value = value;
        r.recipient = recipient;
        r.complete = false;
        r.approvalCount = 0;

        numberOfRequests++;
    }
    
    function approveRequest(uint index) public {
        Request storage request = requests[index];
        
        require(isAContributor[msg.sender]); 
        require(!request.approvals[msg.sender]); // has not already approved this request
        
        request.approvals[msg.sender] = true;
        request.approvalCount++;
    }
    
    function finalizeRequest(uint index) public {
         Request storage request = requests[index];
         
         require(!request.complete, "request already completed");
         require(request.approvalCount > (contributorCount / 2), "not enough approvals");
         
         request.complete = true;
         request.recipient.transfer(request.value);
    }

    function getSummary() public view returns (uint, uint, uint, uint, address) {
        return (
            minimumContribution,
            address(this).balance,
            numberOfRequests,
            contributorCount,
            manager
        );
    }

}